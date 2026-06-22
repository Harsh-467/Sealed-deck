// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PokerTable} from "../src/PokerTable.sol";

contract PokerTableTest is Test {
    PokerTable internal table;

    uint256 internal constant BUY_IN = 1 ether;
    uint256 internal constant SB = 0.01 ether;
    uint256 internal constant BB = 0.02 ether;
    uint256 internal constant TIMEOUT = 10;

    // Deterministic player keys/addresses.
    uint256 internal pk0 = 0xA11CE;
    uint256 internal pk1 = 0xB0B;
    address internal p0; // seat 0 = button / small blind
    address internal p1; // seat 1 = big blind

    bytes internal seed0 = bytes("seed-of-player-zero-0123456789");
    bytes internal seed1 = bytes("seed-of-player-one-9876543210");

    function setUp() public {
        p0 = vm.addr(pk0);
        p1 = vm.addr(pk1);
        vm.deal(p0, 10 ether);
        vm.deal(p1, 10 ether);
        table = new PokerTable(BUY_IN, SB, BB, TIMEOUT);
    }

    // --------------------------------------------------------------------- //
    //                               Helpers                                 //
    // --------------------------------------------------------------------- //

    function _join() internal {
        vm.prank(p0);
        table.joinTable{value: BUY_IN}();
        vm.prank(p1);
        table.joinTable{value: BUY_IN}();
    }

    function _commit() internal {
        vm.prank(p0);
        table.commitShuffle(keccak256(seed0));
        vm.prank(p1);
        table.commitShuffle(keccak256(seed1));
    }

    /// @dev Play a full check/bet line down to the river so state == Revealing.
    ///      Final pot = blinds(0.03) + preflop call(0.01) + turn bet/call(0.2) = 0.24 ether.
    function _playToShowdown() internal {
        _join();
        _commit();

        // preflop: SB(p0) calls, BB(p1) checks option
        vm.prank(p0);
        table.callBet();
        vm.prank(p1);
        table.check();

        // flop: non-button(p1) first -> check / check
        vm.prank(p1);
        table.check();
        vm.prank(p0);
        table.check();

        // turn: p1 bets 0.1, p0 calls
        vm.prank(p1);
        table.raiseTo(0.1 ether);
        vm.prank(p0);
        table.callBet();

        // river: check / check -> showdown
        vm.prank(p1);
        table.check();
        vm.prank(p0);
        table.check();
    }

    function _reveal() internal {
        vm.prank(p0);
        table.revealShuffle(seed0);
        vm.prank(p1);
        table.revealShuffle(seed1);
    }

    function _sign(uint256 pk, address winner, uint256 nonce) internal view returns (bytes memory) {
        bytes32 digest = table.settlementDigest(winner, table.pot(), nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // --------------------------------------------------------------------- //
    //                       1. Happy-path full hand                         //
    // --------------------------------------------------------------------- //

    function test_HappyPath_FullHand() public {
        _playToShowdown();

        assertEq(uint8(table.state()), uint8(PokerTable.State.Revealing), "should be revealing");
        assertEq(table.pot(), 0.24 ether, "pot");
        assertEq(table.contributed(p0), 0.12 ether, "p0 contributed");
        assertEq(table.contributed(p1), 0.12 ether, "p1 contributed");

        _reveal();

        // Both agree p0 wins. Both sign the same Settlement.
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory sig1 = _sign(pk1, p0, 0);

        uint256 bal0Before = p0.balance;
        uint256 bal1Before = p1.balance;

        table.settleHand(p0, 0, sig0, sig1);

        assertEq(uint8(table.state()), uint8(PokerTable.State.Settled), "settled");
        // winner gets pot + own uncommitted stack; loser gets own uncommitted stack.
        assertEq(p0.balance, bal0Before + 0.24 ether + (BUY_IN - 0.12 ether), "winner payout");
        assertEq(p1.balance, bal1Before + (BUY_IN - 0.12 ether), "loser refund");
        // Net: winner +0.12, loser -0.12.
        assertEq(address(table).balance, 0, "table drained");
    }

    function test_HappyPath_FoldEndsHandEarly() public {
        _join();
        _commit();
        // preflop: p0 (SB) folds immediately -> p1 wins the pot.
        uint256 bal1Before = p1.balance;
        vm.prank(p0);
        table.fold();

        assertEq(uint8(table.state()), uint8(PokerTable.State.Settled), "settled");
        // pot at fold = blinds only (0.03). p1 (winner) gets pot + uncommitted (1 - 0.02).
        assertEq(p1.balance, bal1Before + 0.03 ether + (BUY_IN - BB), "folder's opp paid");
        assertEq(address(table).balance, 0, "drained");
    }

    // --------------------------------------------------------------------- //
    //                  2. Abort mid-hand -> timeout / slash                 //
    // --------------------------------------------------------------------- //

    function test_Timeout_OpponentNeverCommits() public {
        _join();
        // p0 commits; p1 goes dark.
        vm.prank(p0);
        table.commitShuffle(keccak256(seed0));
        assertEq(table.expectedActor(), p1, "waiting on p1");

        // Not yet past the deadline.
        vm.expectRevert(bytes("not yet"));
        vm.prank(p0);
        table.claimTimeout(p1);

        vm.roll(block.number + TIMEOUT + 1);

        uint256 bal0Before = p0.balance;
        vm.prank(p0);
        table.claimTimeout(p1);

        // Honest player takes the entire table balance; delinquent slashed.
        assertEq(p0.balance, bal0Before + 2 * BUY_IN, "p0 takes all");
        assertEq(uint8(table.state()), uint8(PokerTable.State.Settled), "settled");
        assertEq(address(table).balance, 0, "drained");
    }

    function test_Timeout_AbortDuringBetting() public {
        _join();
        _commit();
        // It is p0's turn preflop; p0 stalls.
        assertEq(table.expectedActor(), p0, "p0 to act");
        vm.roll(block.number + TIMEOUT + 1);

        uint256 bal1Before = p1.balance;
        vm.prank(p1);
        table.claimTimeout(p0);
        assertEq(p1.balance, bal1Before + 2 * BUY_IN, "p1 takes all");
    }

    function test_Timeout_RejectsWrongDelinquent() public {
        _join();
        _commit();
        vm.roll(block.number + TIMEOUT + 1);
        // p0 is the one who must act; calling timeout on p1 must fail.
        vm.expectRevert(bytes("not delinquent"));
        vm.prank(p1);
        table.claimTimeout(p1);
    }

    function test_Timeout_OnlyOpponentCanClaim() public {
        _join();
        _commit();
        vm.roll(block.number + TIMEOUT + 1);
        // p0 is delinquent; p0 cannot slash itself.
        vm.expectRevert(bytes("only opponent"));
        vm.prank(p0);
        table.claimTimeout(p0);
    }

    // --------------------------------------------------------------------- //
    //                    3. Commitment mismatch rejection                   //
    // --------------------------------------------------------------------- //

    function test_Reveal_CommitmentMismatchReverts() public {
        _playToShowdown();
        // p0 reveals a seed that does not hash to the commitment.
        vm.expectRevert(bytes("commitment mismatch"));
        vm.prank(p0);
        table.revealShuffle(bytes("a-different-seed-entirely"));
    }

    function test_Reveal_CorrectSeedAccepted() public {
        _playToShowdown();
        vm.prank(p0);
        table.revealShuffle(seed0);
        assertTrue(table.hasRevealed(p0), "p0 revealed");
        assertEq(table.expectedActor(), p1, "now waiting on p1");
    }

    function test_Commit_RejectsEmptyCommitment() public {
        _join();
        vm.expectRevert(bytes("empty commitment"));
        vm.prank(p0);
        table.commitShuffle(bytes32(0));
    }

    // --------------------------------------------------------------------- //
    //             4. Double-spend / replay on settlement                    //
    // --------------------------------------------------------------------- //

    function test_Settle_CannotSettleTwice() public {
        _playToShowdown();
        _reveal();
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory sig1 = _sign(pk1, p0, 0);
        table.settleHand(p0, 0, sig0, sig1);

        // Second settle on a terminal table reverts.
        vm.expectRevert(bytes("not settleable"));
        table.settleHand(p0, 0, sig0, sig1);
    }

    function test_Settle_StaleNonceReverts() public {
        _playToShowdown();
        _reveal();
        // settleNonce is 0; a signature/call using nonce 1 must fail.
        bytes memory sig0 = _sign(pk0, p0, 1);
        bytes memory sig1 = _sign(pk1, p0, 1);
        vm.expectRevert(bytes("bad nonce"));
        table.settleHand(p0, 1, sig0, sig1);
    }

    function test_Settle_RequiresBothSignatures() public {
        _playToShowdown();
        _reveal();
        // Both signatures from p0 (winner trying to forge p1's agreement).
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory forged = _sign(pk0, p0, 0);
        vm.expectRevert(bytes("bad sig seat1"));
        table.settleHand(p0, 0, sig0, forged);
    }

    function test_Settle_RejectsSwappedSeatSignatures() public {
        _playToShowdown();
        _reveal();
        // Put seat1's sig in seat0's slot and vice versa.
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory sig1 = _sign(pk1, p0, 0);
        vm.expectRevert(bytes("bad sig seat0"));
        table.settleHand(p0, 0, sig1, sig0);
    }

    function test_Settle_RequiresRevealFirst() public {
        _playToShowdown();
        // No reveals yet.
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory sig1 = _sign(pk1, p0, 0);
        vm.expectRevert(bytes("reveal first"));
        table.settleHand(p0, 0, sig0, sig1);
    }

    // --------------------------------------------------------------------- //
    //                    Dispute / void backstop                            //
    // --------------------------------------------------------------------- //

    function test_Void_RefundsEachOwnContributionAfterDeadline() public {
        _playToShowdown();
        _reveal();
        // Players disagree -> nobody settles. After the deadline either can void.
        vm.roll(block.number + TIMEOUT + 1);

        uint256 bal0Before = p0.balance;
        uint256 bal1Before = p1.balance;
        vm.prank(p0);
        table.voidAndRefund();

        assertEq(uint8(table.state()), uint8(PokerTable.State.Voided), "voided");
        assertEq(p0.balance, bal0Before + BUY_IN, "p0 refunded buy-in");
        assertEq(p1.balance, bal1Before + BUY_IN, "p1 refunded buy-in");
        assertEq(address(table).balance, 0, "drained");
    }

    function test_Void_TooEarlyReverts() public {
        _playToShowdown();
        _reveal();
        vm.expectRevert(bytes("too early"));
        vm.prank(p0);
        table.voidAndRefund();
    }

    // --------------------------------------------------------------------- //
    //                    Join / config guards                               //
    // --------------------------------------------------------------------- //

    function test_Join_WrongBuyInReverts() public {
        vm.expectRevert(bytes("wrong buy-in"));
        vm.prank(p0);
        table.joinTable{value: 0.5 ether}();
    }

    function test_Join_CannotJoinTwice() public {
        vm.prank(p0);
        table.joinTable{value: BUY_IN}();
        vm.expectRevert(bytes("already joined"));
        vm.prank(p0);
        table.joinTable{value: BUY_IN}();
    }

    function test_Cancel_RefundsLoneCreator() public {
        vm.prank(p0);
        table.joinTable{value: BUY_IN}();
        uint256 balBefore = p0.balance;
        vm.prank(p0);
        table.cancel();
        assertEq(p0.balance, balBefore + BUY_IN, "refunded");
        assertEq(uint8(table.state()), uint8(PokerTable.State.Voided), "voided");
    }

    function test_Betting_CannotActOutOfTurn() public {
        _join();
        _commit();
        // It's p0's turn; p1 acting must revert.
        vm.expectRevert(bytes("not your turn"));
        vm.prank(p1);
        table.check();
    }

    function test_Betting_CannotBetMoreThanStack() public {
        _join();
        _commit();
        // p0 tries to raise beyond its 1 ether stack.
        vm.expectRevert(bytes("exceeds stack"));
        vm.prank(p0);
        table.raiseTo(2 ether);
    }
}
