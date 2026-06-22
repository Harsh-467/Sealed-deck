// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PokerTable} from "../src/PokerTable.sol";

/// @notice Deploys one PokerTable. Parameters come from the environment so the same
///         script works against anvil and Fuji.
///
/// Required env:
///   PRIVATE_KEY      throwaway deployer key (also used to broadcast)
/// Optional env (sensible Fuji-demo defaults if unset):
///   BUY_IN_WEI       default 0.05 ether
///   SMALL_BLIND_WEI  default 0.0005 ether
///   BIG_BLIND_WEI    default 0.001 ether
///   TIMEOUT_BLOCKS   default 30   (~1 min on Fuji at ~2s blocks)
contract Deploy is Script {
    function run() external returns (PokerTable table) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 buyIn = vm.envOr("BUY_IN_WEI", uint256(0.05 ether));
        uint256 sb = vm.envOr("SMALL_BLIND_WEI", uint256(0.0005 ether));
        uint256 bb = vm.envOr("BIG_BLIND_WEI", uint256(0.001 ether));
        uint256 timeout = vm.envOr("TIMEOUT_BLOCKS", uint256(30));

        vm.startBroadcast(pk);
        table = new PokerTable(buyIn, sb, bb, timeout);
        vm.stopBroadcast();

        console2.log("PokerTable deployed at:", address(table));
        console2.log("  buyIn (wei):     ", buyIn);
        console2.log("  smallBlind (wei):", sb);
        console2.log("  bigBlind (wei):  ", bb);
        console2.log("  timeoutBlocks:   ", timeout);
        console2.log("  chainId:         ", block.chainid);
    }
}
