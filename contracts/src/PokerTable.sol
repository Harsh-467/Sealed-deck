// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PokerTable
/// @notice Trustless, provably-fair heads-up (2-player) poker for a single hand.
///         The deck is shuffled/encrypted off-chain (commit-reveal + SRA commutative
///         encryption). This contract is the on-chain custody, betting-accounting,
///         commit/reveal and settlement layer. It NEVER sees cleartext cards.
///
/// Trust model (see README "settleHand trust model"):
///   - Funds custody & payout are trustless: the pot only moves via (a) a settlement
///     signed by BOTH players (no unilateral claim), (b) a fold, (c) a timeout slash
///     of a delinquent player, or (d) a dispute void that refunds each player's own
///     contribution. The relay server can NEVER move funds.
///   - Betting *legality* (is this check/raise legal, is the street over) is enforced
///     by this contract for the safety-critical parts (you cannot bet more than your
///     staked stack, you cannot act out of turn) and mirrored by the off-chain server
///     for UX. We deliberately do NOT reconstruct/evaluate cards on-chain (that is the
///     ZK-shuffle territory we scoped out); disagreements resolve via timeout or void.
contract PokerTable {
    // --------------------------------------------------------------------- //
    //                                 Types                                  //
    // --------------------------------------------------------------------- //

    enum State {
        Open, // created; waiting for 2 players to join + stake the buy-in
        Committing, // both joined; each must post a shuffle-seed commitment
        Betting, // hand live; betting across preflop/flop/turn/river
        Revealing, // betting closed; both must reveal their shuffle seed
        Settled, // pot paid out (settle / fold / timeout) — terminal
        Voided // disputed/aborted; each player refunded their own contribution — terminal
    }

    // Action codes used in the BetPlaced event.
    uint8 internal constant ACT_CHECK = 0;
    uint8 internal constant ACT_CALL = 1;
    uint8 internal constant ACT_BET = 2;
    uint8 internal constant ACT_RAISE = 3;

    uint8 internal constant NUM_STREETS = 4; // preflop(0) flop(1) turn(2) river(3)

    // --------------------------------------------------------------------- //
    //                          Immutable configuration                      //
    // --------------------------------------------------------------------- //

    uint256 public immutable buyIn; // each player stakes exactly this on join
    uint256 public immutable smallBlind;
    uint256 public immutable bigBlind;
    uint256 public immutable timeoutBlocks; // N: blocks a player has to act before slashable

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 internal constant SETTLEMENT_TYPEHASH =
        keccak256("Settlement(address table,address winner,uint256 pot,uint256 nonce)");

    // --------------------------------------------------------------------- //
    //                                 Players                               //
    // --------------------------------------------------------------------- //

    address[2] public players; // seat 0 = creator = button/small-blind by default
    uint8 public numPlayers;
    mapping(address => bool) public isPlayer;
    mapping(address => uint8) public seatOf;

    // --------------------------------------------------------------------- //
    //                             Commit / Reveal                           //
    // --------------------------------------------------------------------- //

    mapping(address => bytes32) public shuffleCommit; // keccak256(seed)
    mapping(address => bool) public hasCommitted;
    mapping(address => bool) public hasRevealed;
    uint8 public numCommitted;
    uint8 public numRevealed;

    // --------------------------------------------------------------------- //
    //                            Pot / betting state                        //
    // --------------------------------------------------------------------- //

    uint256 public pot; // chips currently in the pot
    mapping(address => uint256) public contributed; // chips this player has moved into the pot
    mapping(address => uint256) public streetBet; // chips committed in the current street
    mapping(address => bool) public actedThisStreet; // has this player acted since the last bet/raise
    uint256 public currentBet; // max streetBet this street (the amount "to match")
    uint8 public street; // 0..3
    uint8 public button; // seat index of the button (small blind / first to act preflop)

    // --------------------------------------------------------------------- //
    //                          Lifecycle / settlement                       //
    // --------------------------------------------------------------------- //

    State public state;
    address public toAct; // during Betting: whose turn it is
    address public expectedActor; // who the timeout clock is waiting on
    uint256 public deadline; // block.number by which expectedActor must act
    uint256 public settleNonce; // monotonically-increasing; replay guard for settlement

    bool private _locked; // reentrancy guard

    // --------------------------------------------------------------------- //
    //                                 Events                                //
    // --------------------------------------------------------------------- //

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

    // --------------------------------------------------------------------- //
    //                                Modifiers                              //
    // --------------------------------------------------------------------- //

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

    // --------------------------------------------------------------------- //
    //                               Constructor                             //
    // --------------------------------------------------------------------- //

    /// @param _buyIn        stake each player locks on join (wei)
    /// @param _smallBlind   small blind (wei), posted by the button
    /// @param _bigBlind     big blind (wei), posted by the non-button
    /// @param _timeoutBlocks blocks a player has to act before they can be slashed
    constructor(uint256 _buyIn, uint256 _smallBlind, uint256 _bigBlind, uint256 _timeoutBlocks) {
        require(_buyIn > 0, "buyIn=0");
        require(_bigBlind >= _smallBlind && _smallBlind > 0, "bad blinds");
        require(_bigBlind <= _buyIn, "blind > buyIn");
        require(_timeoutBlocks > 0, "timeout=0");

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

    // --------------------------------------------------------------------- //
    //                                  Join                                  //
    // --------------------------------------------------------------------- //

    /// @notice Stake the buy-in and take a seat. The first two distinct callers play.
    function joinTable() external payable nonReentrant {
        require(state == State.Open, "not open");
        require(!isPlayer[msg.sender], "already joined");
        require(msg.value == buyIn, "wrong buy-in");
        require(numPlayers < 2, "table full");

        uint8 seat = numPlayers;
        players[seat] = msg.sender;
        seatOf[msg.sender] = seat;
        isPlayer[msg.sender] = true;
        numPlayers++;

        emit Joined(msg.sender, seat, msg.value);

        if (numPlayers == 2) {
            state = State.Committing;
            // Timeout clock starts on seat 0 to post the first commitment.
            expectedActor = players[0];
            deadline = block.number + timeoutBlocks;
        }
    }

    /// @notice Creator can reclaim their stake if no opponent ever joins.
    function cancel() external nonReentrant onlyPlayer {
        require(state == State.Open, "not open");
        require(numPlayers == 1 && msg.sender == players[0], "cannot cancel");
        state = State.Voided;
        uint256 refund = buyIn;
        emit Voided(refund, 0);
        _send(msg.sender, refund);
    }

    // --------------------------------------------------------------------- //
    //                            Commit / Reveal                            //
    // --------------------------------------------------------------------- //

    /// @notice Post keccak256(seed) before any cards are dealt. Both players commit,
    ///         so neither can choose their shuffle seed after seeing the other's.
    function commitShuffle(bytes32 commitment) external onlyPlayer {
        require(state == State.Committing, "not committing");
        require(!hasCommitted[msg.sender], "already committed");
        require(commitment != bytes32(0), "empty commitment");

        hasCommitted[msg.sender] = true;
        shuffleCommit[msg.sender] = commitment;
        numCommitted++;
        emit Committed(msg.sender, commitment);

        if (numCommitted == 1) {
            // Wait on the other player to commit.
            expectedActor = (msg.sender == players[0]) ? players[1] : players[0];
            deadline = block.number + timeoutBlocks;
        } else {
            _startHand();
        }
    }

    /// @notice After betting closes, reveal the seed so the shuffle can be verified.
    ///         The contract checks keccak256(seed) == the earlier commitment.
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
            // Both revealed: hand off to mutual settlement. No single party is now
            // "expected to act" — settlement needs both signatures, and a stall is
            // handled by voidAndRefund() after the deadline.
            expectedActor = address(0);
            deadline = block.number + timeoutBlocks;
        }
    }

    // --------------------------------------------------------------------- //
    //                                Betting                                //
    // --------------------------------------------------------------------- //
    // Bets draw from the already-staked buy-in (no per-action msg.value); the
    // contract holds 2*buyIn and tracks how much of each stack is in the pot.

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

    /// @notice Raise the total committed-this-street to `total` (a bet if currentBet==0).
    function raiseTo(uint256 total) external onlyPlayer {
        _requireTurn();
        require(total > currentBet, "raise too small");
        uint256 add = total - streetBet[msg.sender];
        require(add > 0, "no chips added");
        _moveToPot(msg.sender, add);
        streetBet[msg.sender] = total;
        currentBet = total;
        // A raise reopens the action: the opponent must respond again.
        actedThisStreet[msg.sender] = true;
        actedThisStreet[_opp(msg.sender)] = false;
        uint8 action = (total == add && currentBet == total && streetBet[_opp(msg.sender)] == 0)
            ? ACT_BET
            : ACT_RAISE;
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

    // --------------------------------------------------------------------- //
    //                              Settlement                               //
    // --------------------------------------------------------------------- //

    /// @notice Cooperative settlement: BOTH players sign an EIP-712 Settlement agreeing
    ///         on the winner and pot. Neither can settle unilaterally.
    /// @param winner   agreed winning player
    /// @param nonce    must equal settleNonce (replay guard)
    /// @param sigSeat0 signature by players[0] over the Settlement struct
    /// @param sigSeat1 signature by players[1] over the Settlement struct
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

        settleNonce++; // burn the nonce so the exact (winner,pot,nonce) cannot replay
        _payoutWinner(winner);
    }

    /// @notice Dispute / deadlock backstop. After both players have revealed but failed
    ///         to agree on a signed winner before the deadline, either player may void
    ///         the hand: each is refunded exactly their own contribution. A griefer can
    ///         force a void but can never take the opponent's chips.
    function voidAndRefund() external nonReentrant onlyPlayer {
        require(state == State.Revealing, "not voidable");
        require(numRevealed == 2, "reveal first");
        require(block.number > deadline, "too early");

        state = State.Voided;
        uint256 r0 = buyIn; // each gets their whole stake back (pot is unwound)
        uint256 r1 = buyIn;
        // Effects done; interactions last.
        emit Voided(r0, r1);
        _send(players[0], r0);
        _send(players[1], r1);
    }

    // --------------------------------------------------------------------- //
    //                            Timeout / slashing                         //
    // --------------------------------------------------------------------- //

    /// @notice Slash a player who failed to act within N blocks. Callable by the other
    ///         player. The delinquent forfeits their ENTIRE stake; the honest player
    ///         takes the whole table balance. This is the anti-freeze guarantee.
    function claimTimeout(address delinquent) external nonReentrant onlyPlayer {
        require(
            state == State.Committing || state == State.Betting || state == State.Revealing,
            "not timeoutable"
        );
        require(block.number > deadline, "not yet");
        require(delinquent == expectedActor, "not delinquent");
        require(msg.sender == _opp(delinquent), "only opponent");

        address beneficiary = msg.sender;
        uint256 amount = address(this).balance;
        state = State.Settled;
        emit Slashed(delinquent, beneficiary, amount);
        emit Settled(beneficiary, amount, 0, settleNonce);
        _send(beneficiary, amount);
    }

    // --------------------------------------------------------------------- //
    //                            View helpers                               //
    // --------------------------------------------------------------------- //

    /// @notice Remaining stack a player can still bet (staked buy-in minus contributed).
    function stackOf(address player) external view returns (uint256) {
        return buyIn - contributed[player];
    }

    /// @notice How much `player` must put in to match the current bet.
    function owedBy(address player) external view returns (uint256) {
        return currentBet - streetBet[player];
    }

    /// @notice EIP-712 digest a player must sign to agree on settlement.
    function settlementDigest(address winner, uint256 pot_, uint256 nonce) public view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(SETTLEMENT_TYPEHASH, address(this), winner, pot_, nonce));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    // --------------------------------------------------------------------- //
    //                            Internal logic                             //
    // --------------------------------------------------------------------- //

    function _startHand() internal {
        state = State.Betting;
        street = 0;
        button = 0; // seat 0 is the button/small blind for this single hand
        address sb = players[button];
        address bb = players[1 - button];

        // Post blinds out of each staked stack.
        _moveToPot(sb, smallBlind);
        _moveToPot(bb, bigBlind);
        streetBet[sb] = smallBlind;
        streetBet[bb] = bigBlind;
        currentBet = bigBlind;

        // Heads-up: button/SB acts first preflop. Blinds are forced, not "acting".
        actedThisStreet[sb] = false;
        actedThisStreet[bb] = false;
        toAct = sb;
        expectedActor = sb;
        deadline = block.number + timeoutBlocks;

        emit HandStarted(players[button], smallBlind, bigBlind);
    }

    /// @dev Called after a check or call to either pass the turn or close the street.
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
        // Reset per-street betting state.
        address p0 = players[0];
        address p1 = players[1];
        actedThisStreet[p0] = false;
        actedThisStreet[p1] = false;
        streetBet[p0] = 0;
        streetBet[p1] = 0;
        currentBet = 0;

        if (street == NUM_STREETS - 1) {
            // River betting done -> showdown: both must reveal their seed.
            state = State.Revealing;
            expectedActor = players[0];
            deadline = block.number + timeoutBlocks;
            emit StreetAdvanced(NUM_STREETS, address(0));
        } else {
            street += 1;
            // Postflop the non-button acts first.
            address first = players[1 - button];
            toAct = first;
            expectedActor = first;
            deadline = block.number + timeoutBlocks;
            emit StreetAdvanced(street, first);
        }
    }

    function _payoutWinner(address winner) internal {
        address loser = _opp(winner);
        uint256 toWinner = pot + (buyIn - contributed[winner]); // pot + winner's uncommitted stack
        uint256 toLoser = buyIn - contributed[loser]; // loser keeps only their uncommitted stack
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
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "transfer failed");
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

    receive() external payable {
        revert("use joinTable");
    }
}
