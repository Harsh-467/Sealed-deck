/** Imperative PokerTable interactions via wagmi core actions. Money only ever moves
 *  through the player's own wallet — the relay signs nothing. */
import {
  writeContract,
  waitForTransactionReceipt,
  signTypedData,
  readContract,
} from '@wagmi/core';
import type { Address, Hex } from 'viem';
import { pokerTableAbi } from '@sealed-deck/contracts-abi';
import { wagmiConfig } from '../wagmi';
import { APP } from '../config';

const abi = pokerTableAbi;

function table(): Address {
  if (!APP.tableAddress) throw new Error('VITE_POKER_TABLE_ADDRESS not set');
  return APP.tableAddress as Address;
}

async function send(functionName: string, args: unknown[] = [], value?: bigint): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    address: table(),
    abi,
    functionName: functionName as never,
    args: args as never,
    value,
  });
  await waitForTransactionReceipt(wagmiConfig, { hash });
  return hash;
}

export const tx = {
  join: (buyIn: bigint) => send('joinTable', [], buyIn),
  commit: (commitment: Hex) => send('commitShuffle', [commitment]),
  check: () => send('check'),
  callBet: () => send('callBet'),
  raiseTo: (total: bigint) => send('raiseTo', [total]),
  fold: () => send('fold'),
  revealShuffle: (seed: Hex) => send('revealShuffle', [seed]),
  voidAndRefund: () => send('voidAndRefund'),
  settleHand: (winner: Address, nonce: bigint, sig0: Hex, sig1: Hex) =>
    send('settleHand', [winner, nonce, sig0, sig1]),
};

export async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  return readContract(wagmiConfig, {
    address: table(),
    abi,
    functionName: functionName as never,
    args: args as never,
  }) as Promise<T>;
}

/** Sign the EIP-712 Settlement struct the contract verifies in settleHand(). */
export async function signSettlement(winner: Address, pot: bigint, nonce: bigint): Promise<Hex> {
  return signTypedData(wagmiConfig, {
    domain: {
      name: 'SealedDeck',
      version: '1',
      chainId: APP.chainId,
      verifyingContract: table(),
    },
    types: {
      Settlement: [
        { name: 'table', type: 'address' },
        { name: 'winner', type: 'address' },
        { name: 'pot', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Settlement',
    message: { table: table(), winner, pot, nonce },
  });
}
