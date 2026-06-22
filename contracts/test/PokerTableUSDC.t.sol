// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PokerTableUSDC} from "../src/PokerTableUSDC.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Exercises the x402 USDC buy-in path end-to-end against a mock EIP-3009 USDC.
contract PokerTableUSDCTest is Test {
    MockUSDC internal usdc;
    PokerTableUSDC internal table;

    uint256 internal constant BUY_IN = 50e6; // 50 USDC (6dp)
    uint256 internal constant SB = 0.5e6;
    uint256 internal constant BB = 1e6;
    uint256 internal constant TIMEOUT = 10;

    uint256 internal pk0 = 0xA11CE;
    uint256 internal pk1 = 0xB0B;
    address internal p0;
    address internal p1;

    bytes internal seed0 = bytes("seed-zero");
    bytes internal seed1 = bytes("seed-one");

    function setUp() public {
        p0 = vm.addr(pk0);
        p1 = vm.addr(pk1);
        usdc = new MockUSDC();
        usdc.mint(p0, 1000e6);
        usdc.mint(p1, 1000e6);
        table = new PokerTableUSDC(address(usdc), BUY_IN, SB, BB, TIMEOUT);
    }

    // Build + submit an EIP-3009 authorization that funds the buy-in (the x402 X-PAYMENT).
    function _authJoin(uint256 pk, address from, bytes32 nonce) internal {
        uint256 validAfter = 0;
        uint256 validBefore = type(uint256).max;
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                from,
                address(table),
                BUY_IN,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        // Anyone (a facilitator) can submit; here the test acts as the facilitator.
        table.joinWithAuthorization(from, validAfter, validBefore, nonce, v, r, s);
    }

    function _joinBoth() internal {
        _authJoin(pk0, p0, keccak256("n0"));
        _authJoin(pk1, p1, keccak256("n1"));
    }

    function _commit() internal {
        vm.prank(p0);
        table.commitShuffle(keccak256(seed0));
        vm.prank(p1);
        table.commitShuffle(keccak256(seed1));
    }

    function _playToShowdown() internal {
        _joinBoth();
        _commit();
        vm.prank(p0);
        table.callBet();
        vm.prank(p1);
        table.check();
        vm.prank(p1);
        table.check();
        vm.prank(p0);
        table.check();
        vm.prank(p1);
        table.raiseTo(5e6);
        vm.prank(p0);
        table.callBet();
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

    function test_X402BuyIn_FundsTableViaEIP3009() public {
        _joinBoth();
        assertEq(usdc.balanceOf(address(table)), 2 * BUY_IN, "table holds both buy-ins");
        assertEq(table.numPlayers(), 2, "two seated");
        assertEq(uint8(table.state()), uint8(PokerTableUSDC.State.Committing), "committing");
    }

    function test_X402BuyIn_RejectsForgedAuthorization() public {
        // p1 signs but we claim it's from p0 -> recovered signer != from.
        bytes32 nonce = keccak256("bad");
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                p0,
                address(table),
                BUY_IN,
                uint256(0),
                type(uint256).max,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk1, digest); // wrong signer
        vm.expectRevert(bytes("bad auth sig"));
        table.joinWithAuthorization(p0, 0, type(uint256).max, nonce, v, r, s);
    }

    function test_HappyPath_SettlesInUSDC() public {
        _playToShowdown();
        assertEq(uint8(table.state()), uint8(PokerTableUSDC.State.Revealing), "revealing");
        assertEq(table.pot(), 0.5e6 + 1e6 + 0.5e6 + 5e6 + 5e6, "pot"); // blinds + preflop call + turn bet/call
        _reveal();

        uint256 bal0 = usdc.balanceOf(p0);
        uint256 bal1 = usdc.balanceOf(p1);
        bytes memory sig0 = _sign(pk0, p0, 0);
        bytes memory sig1 = _sign(pk1, p0, 0);
        table.settleHand(p0, 0, sig0, sig1);

        uint256 contributed0 = table.contributed(p0);
        uint256 contributed1 = table.contributed(p1);
        assertEq(usdc.balanceOf(p0), bal0 + table.pot() + (BUY_IN - contributed0), "winner USDC");
        assertEq(usdc.balanceOf(p1), bal1 + (BUY_IN - contributed1), "loser USDC");
        assertEq(usdc.balanceOf(address(table)), 0, "table drained");
    }

    function test_Timeout_SlashesInUSDC() public {
        _joinBoth();
        vm.prank(p0);
        table.commitShuffle(keccak256(seed0));
        // p1 never commits
        vm.roll(block.number + TIMEOUT + 1);
        uint256 bal0 = usdc.balanceOf(p0);
        vm.prank(p0);
        table.claimTimeout(p1);
        assertEq(usdc.balanceOf(p0), bal0 + 2 * BUY_IN, "p0 takes all USDC");
    }

    function test_JoinWithApproval_Fallback() public {
        vm.prank(p0);
        usdc.approve(address(table), BUY_IN);
        vm.prank(p0);
        table.joinWithApproval();
        assertEq(usdc.balanceOf(address(table)), BUY_IN, "approval join funded");
        assertTrue(table.isPlayer(p0), "seated");
    }
}
