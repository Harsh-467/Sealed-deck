// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PokerTableUSDC} from "../src/PokerTableUSDC.sol";

/// @notice Deploys a USDC-denominated table for the x402 buy-in path on Avalanche.
///
/// Required env:
///   PRIVATE_KEY        throwaway deployer key
///   USDC_ADDRESS       Avalanche USDC. Fuji default: 0x5425890298aed601595a70AB815c96711a31Bc65
/// Optional env (USDC has 6 decimals):
///   BUY_IN_USDC        default 50000000   (50 USDC)
///   SMALL_BLIND_USDC   default 500000      (0.5 USDC)
///   BIG_BLIND_USDC     default 1000000     (1 USDC)
///   TIMEOUT_BLOCKS     default 30
contract DeployUSDC is Script {
    function run() external returns (PokerTableUSDC table) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envOr("USDC_ADDRESS", address(0x5425890298aed601595a70AB815c96711a31Bc65));
        uint256 buyIn = vm.envOr("BUY_IN_USDC", uint256(50_000_000));
        uint256 sb = vm.envOr("SMALL_BLIND_USDC", uint256(500_000));
        uint256 bb = vm.envOr("BIG_BLIND_USDC", uint256(1_000_000));
        uint256 timeout = vm.envOr("TIMEOUT_BLOCKS", uint256(30));

        vm.startBroadcast(pk);
        table = new PokerTableUSDC(usdc, buyIn, sb, bb, timeout);
        vm.stopBroadcast();

        console2.log("PokerTableUSDC deployed at:", address(table));
        console2.log("  USDC:           ", usdc);
        console2.log("  buyIn (6dp):    ", buyIn);
        console2.log("  chainId:        ", block.chainid);
    }
}
