// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice EIP-3009 / x402 interface of Avalanche's native Circle USDC.
interface IUSDC {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title PokerTableUSDC
/// @notice USDC-denominated heads-up table for the x402 buy-in path on Avalanche. The
///         buy-in is funded by an EIP-3009 `transferWithAuthorization` — the exact
///         primitive an x402 facilitator settles — so a player signs the buy-in off-chain
///         (the X-PAYMENT) and a facilitator submits it. Betting, commit/reveal, dual-sign
///         settlement and timeout/slash are identical to the AVAX PokerTable; only the
///         denomination (native AVAX -> Avalanche USDC) differs.
contract PokerTableUSDC {
    enum State { Open, Committing, Betting, Revealing, Settled, Voided }

    uint8 internal constant ACT_CHECK = 0;
    uint8 internal constant ACT_CALL = 1;
    uint8 internal constant ACT_BET = 2;
    uint8 internal constant ACT_RAISE = 3;
    uint8 internal constant NUM_STREETS = 4;

    IUSDC public immutable usdc;
    uint256 public immutable buyIn;
    uint256 public immutable smallBlind;
    uint256 public immutable bigBlind;
    uint256 public immutable timeoutBlocks;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 internal constant SETTLEMENT_TYPEHASH =
        keccak256("Settlement(address table,address winner,uint256 pot,uint256 nonce)");

    address[2] public players;
    uint8 public numPlayers;
    mapping(address => bool) public isPlayer;
    mapping(address => uint8) public seatOf;

    mapping(address => bytes32) public shuffleCommit;
    mapping(address => bool) public hasCommitted;
    mapping(address => bool) public hasRevealed;
    uint8 public numCommitted;
    uint8 public numRevealed;

    uint256 public pot;
    mapping(address => uint256) public contributed;
    mapping(address => uint256) public streetBet;
    mapping(address => bool) public actedThisStreet;
    uint256 public currentBet;
    uint8 public street;
    uint8 public button;

    State public state;
    address public toAct;
    address public expectedActor;
    uint256 public deadline;
    uint256 public settleNonce;
    bool private _locked;

    event Joined(address indexed player, uint8 seat, uint256 buyIn);
    event Committed(address indexed player, bytes32 commitment);
    event HandStarted(address indexed button, uint256 smallBlind, uint256 bigBlind);
    event BetPlaced(
        address indexed player, uint8 street, uint8 action, uint256 amount, uint256 toMatch, uint256 pot
    );
    event Folded(address indexed player, address indexed winner);
    event StreetAdvanced(uint8 newStreet, address indexed firstToAct);
    event Revealed(address indexed player, bytes seed);
    event Settled(address indexed winner, uint256 toWinner, uint256 toLoser, uint256 nonce);
    event Slashed(address indexed delinquent, address indexed beneficiary, uint256 amount);
    event Voided(uint256 refundSeat0, uint256 refundSeat1);

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyPlayer() {
        require(isPlayer[msg.sender], "not a player");
        _;
    }

    constructor(
        address _usdc,
        uint256 _buyIn,
        uint256 _smallBlind,
        uint256 _bigBlind,
        uint256 _timeoutBlocks
    ) {
        require(_usdc != address(0), "usdc=0");
        require(_buyIn > 0, "buyIn=0");
        require(_bigBlind >= _smallBlind && _smallBlind > 0, "bad blinds");
        require(_bigBlind <= _buyIn, "blind > buyIn");
        require(_timeoutBlocks > 0, "timeout=0");
        usdc = IUSDC(_usdc);
        buyIn = _buyIn;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        timeoutBlocks = _timeoutBlocks;
        state = State.Open;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("SealedDeck")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ------------------------------- join (x402) --------------------------- //

    /// @notice x402 buy-in: settle an EIP-3009 authorization (signed by `from`, the
    ///         X-PAYMENT) that transfers exactly `buyIn` USDC into this table. Any party
    ///         (a facilitator) may submit it; the seat is assigned to `from`.
    function joinWithAuthorization(
        address from,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _preJoin(from);
        usdc.transferWithAuthorization(from, address(this), buyIn, validAfter, validBefore, nonce, v, r, s);
        _seat(from);
    }

    /// @notice Non-x402 fallback: player pre-approved the table, contract pulls the buy-in.
    function joinWithApproval() external nonReentrant {
        _preJoin(msg.sender);
        require(usdc.transferFrom(msg.sender, address(this), buyIn), "usdc pull failed");
        _seat(msg.sender);
    }

    function _preJoin(address who) internal view {
        require(state == State.Open, "not open");
        require(!isPlayer[who], "already joined");
        require(numPlayers < 2, "table full");
    }

    function _seat(address who) internal {
        uint8 seat = numPlayers;
        players[seat] = who;
        seatOf[who] = seat;
        isPlayer[who] = true;
        numPlayers++;
        emit Joined(who, seat, buyIn);
        if (numPlayers == 2) {
            state = State.Committing;
            expectedActor = players[0];
            deadline = block.number + timeoutBlocks;
        }
    }

    function cancel() external nonReentrant onlyPlayer {
        require(state == State.Open, "not open");
        require(numPlayers == 1 && msg.sender == players[0], "cannot cancel");
        state = State.Voided;
        emit Voided(buyIn, 0);
        _send(msg.sender, buyIn);
    }

    // ---------------------------- commit / reveal -------------------------- //

    function commitShuffle(bytes32 commitment) external onlyPlayer {
        require(state == State.Committing, "not committing");
        require(!hasCommitted[msg.sender], "already committed");
        require(commitment != bytes32(0), "empty commitment");
        hasCommitted[msg.sender] = true;
        shuffleCommit[msg.sender] = commitment;
        numCommitted++;
        emit Committed(msg.sender, commitment);
        if (numCommitted == 1) {
            expectedActor = (msg.sender == players[0]) ? players[1] : players[0];
            deadline = block.number + timeoutBlocks;
        } else {
            _startHand();
        }
    }

    function revealShuffle(bytes calldata seed) external onlyPlayer {
        require(state == State.Revealing, "not revealing");
        require(!hasRevealed[msg.sender], "already revealed");
        require(keccak256(seed) == shuffleCommit[msg.sender], "commitment mismatch");
        hasRevealed[msg.sender] = true;
        numRevealed++;
        emit Revealed(msg.sender, seed);
        if (numRevealed == 1) {
            expectedActor = (msg.sender == players[0]) ? players[1] : players[0];
            deadline = block.number + timeoutBlocks;
        } else {
            expectedActor = address(0);
            deadline = block.number + timeoutBlocks;
        }
    }

    // -------------------------------- betting ------------------------------ //

    function check() external onlyPlayer {
        _requireTurn();
        require(streetBet[msg.sender] == currentBet, "must call/raise");
        actedThisStreet[msg.sender] = true;
        emit BetPlaced(msg.sender, street, ACT_CHECK, 0, currentBet, pot);
        _afterAction();
    }

    function callBet() external onlyPlayer {
        _requireTurn();
        uint256 owed = currentBet - streetBet[msg.sender];
        require(owed > 0, "nothing to call");
        _moveToPot(msg.sender, owed);
        actedThisStreet[msg.sender] = true;
        emit BetPlaced(msg.sender, street, ACT_CALL, owed, currentBet, pot);
        _afterAction();
    }

    function raiseTo(uint256 total) external onlyPlayer {
        _requireTurn();
        require(total > currentBet, "raise too small");
        uint256 add = total - streetBet[msg.sender];
        require(add > 0, "no chips added");
        _moveToPot(msg.sender, add);
        streetBet[msg.sender] = total;
        currentBet = total;
        actedThisStreet[msg.sender] = true;
        actedThisStreet[_opp(msg.sender)] = false;
        uint8 action = (streetBet[_opp(msg.sender)] == 0) ? ACT_BET : ACT_RAISE;
        emit BetPlaced(msg.sender, street, action, add, currentBet, pot);
        toAct = _opp(msg.sender);
        expectedActor = toAct;
        deadline = block.number + timeoutBlocks;
    }

    function fold() external onlyPlayer {
        _requireTurn();
        address winner = _opp(msg.sender);
        emit Folded(msg.sender, winner);
        _payoutWinner(winner);
    }

    // ------------------------------ settlement ----------------------------- //

    function settleHand(address winner, uint256 nonce, bytes calldata sigSeat0, bytes calldata sigSeat1)
        external
        nonReentrant
    {
        require(state == State.Revealing, "not settleable");
        require(numRevealed == 2, "reveal first");
        require(nonce == settleNonce, "bad nonce");
        require(isPlayer[winner], "winner not a player");
        bytes32 digest = settlementDigest(winner, pot, nonce);
        require(_recover(digest, sigSeat0) == players[0], "bad sig seat0");
        require(_recover(digest, sigSeat1) == players[1], "bad sig seat1");
        settleNonce++;
        _payoutWinner(winner);
    }

    function voidAndRefund() external nonReentrant onlyPlayer {
        require(state == State.Revealing, "not voidable");
        require(numRevealed == 2, "reveal first");
        require(block.number > deadline, "too early");
        state = State.Voided;
        emit Voided(buyIn, buyIn);
        _send(players[0], buyIn);
        _send(players[1], buyIn);
    }

    function claimTimeout(address delinquent) external nonReentrant onlyPlayer {
        require(
            state == State.Committing || state == State.Betting || state == State.Revealing,
            "not timeoutable"
        );
        require(block.number > deadline, "not yet");
        require(delinquent == expectedActor, "not delinquent");
        require(msg.sender == _opp(delinquent), "only opponent");
        address beneficiary = msg.sender;
        uint256 amount = 2 * buyIn; // entire escrow
        state = State.Settled;
        emit Slashed(delinquent, beneficiary, amount);
        emit Settled(beneficiary, amount, 0, settleNonce);
        _send(beneficiary, amount);
    }

    // ------------------------------- views --------------------------------- //

    function stackOf(address player) external view returns (uint256) {
        return buyIn - contributed[player];
    }

    function owedBy(address player) external view returns (uint256) {
        return currentBet - streetBet[player];
    }

    function settlementDigest(address winner, uint256 pot_, uint256 nonce) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(SETTLEMENT_TYPEHASH, address(this), winner, pot_, nonce));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    // ------------------------------ internals ------------------------------ //

    function _startHand() internal {
        state = State.Betting;
        street = 0;
        button = 0;
        address sb = players[button];
        address bb = players[1 - button];
        _moveToPot(sb, smallBlind);
        _moveToPot(bb, bigBlind);
        streetBet[sb] = smallBlind;
        streetBet[bb] = bigBlind;
        currentBet = bigBlind;
        actedThisStreet[sb] = false;
        actedThisStreet[bb] = false;
        toAct = sb;
        expectedActor = sb;
        deadline = block.number + timeoutBlocks;
        emit HandStarted(players[button], smallBlind, bigBlind);
    }

    function _afterAction() internal {
        address opp = _opp(msg.sender);
        bool matched = streetBet[msg.sender] == currentBet && streetBet[opp] == currentBet;
        if (actedThisStreet[opp] && matched) {
            _closeStreet();
        } else {
            toAct = opp;
            expectedActor = opp;
            deadline = block.number + timeoutBlocks;
        }
    }

    function _closeStreet() internal {
        address p0 = players[0];
        address p1 = players[1];
        actedThisStreet[p0] = false;
        actedThisStreet[p1] = false;
        streetBet[p0] = 0;
        streetBet[p1] = 0;
        currentBet = 0;
        if (street == NUM_STREETS - 1) {
            state = State.Revealing;
            expectedActor = players[0];
            deadline = block.number + timeoutBlocks;
            emit StreetAdvanced(NUM_STREETS, address(0));
        } else {
            street += 1;
            address first = players[1 - button];
            toAct = first;
            expectedActor = first;
            deadline = block.number + timeoutBlocks;
            emit StreetAdvanced(street, first);
        }
    }

    function _payoutWinner(address winner) internal {
        address loser = _opp(winner);
        uint256 toWinner = pot + (buyIn - contributed[winner]);
        uint256 toLoser = buyIn - contributed[loser];
        state = State.Settled;
        emit Settled(winner, toWinner, toLoser, settleNonce);
        if (toLoser > 0) _send(loser, toLoser);
        _send(winner, toWinner);
    }

    function _moveToPot(address player, uint256 amount) internal {
        require(contributed[player] + amount <= buyIn, "exceeds stack");
        contributed[player] += amount;
        streetBet[player] += amount;
        pot += amount;
    }

    function _requireTurn() internal view {
        require(state == State.Betting, "not betting");
        require(msg.sender == toAct, "not your turn");
    }

    function _opp(address player) internal view returns (address) {
        return players[0] == player ? players[1] : players[0];
    }

    function _send(address to, uint256 amount) internal {
        require(usdc.transfer(to, amount), "usdc transfer failed");
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig len");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "zero signer");
        return signer;
    }
}
