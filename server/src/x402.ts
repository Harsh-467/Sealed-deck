/**
 * x402 buy-in middleware (Avalanche Fuji). Implements the HTTP 402 handshake for the
 * USDC buy-in:
 *   GET  /x402/buyin/:table?from=0x..  -> 402 with payment requirements (the "accepts")
 *   POST /x402/buyin/:table  (X-PAYMENT header) -> settle the signed EIP-3009 auth
 *
 * The X-PAYMENT payload is an EIP-3009 transferWithAuthorization signed by the player
 * (the buy-in itself), with `to` = the PokerTableUSDC address. Settlement is performed
 * by an x402 facilitator — either an external Avalanche facilitator (X402_FACILITATOR_URL)
 * or, in self-facilitator mode, this server submitting joinWithAuthorization with a
 * relayer key (X402_RELAYER_KEY). The card-relay role still holds no key; the facilitator
 * role is separate and optional.
 *
 * This path is wired and unit-tested at the contract layer (see PokerTableUSDC.t.sol);
 * the live facilitator settlement is the one piece exercised at demo time on Fuji.
 */
import type { Express, Request, Response } from 'express';
import { createWalletClient, http, createPublicClient, type Hex, type Address } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { pokerTableUsdcAbi } from '@sealed-deck/contracts-abi';
import { config } from './config.js';

// Avalanche Fuji native Circle USDC (EIP-3009 capable).
const FUJI_USDC = (process.env.X402_ASSET_ADDRESS ??
  '0x5425890298aed601595a70AB815c96711a31Bc65') as Address;
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? '';
const RELAYER_KEY = (process.env.X402_RELAYER_KEY ?? '') as Hex | '';

const NETWORK = 'avalanche-fuji';
const SCHEME = 'exact';

interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string; // atomic units (USDC 6dp)
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

function requirements(table: string, buyIn: string): PaymentRequirements {
  return {
    scheme: SCHEME,
    network: NETWORK,
    asset: FUJI_USDC,
    payTo: table,
    maxAmountRequired: buyIn,
    resource: `/x402/buyin/${table}`,
    description: 'Sealed Deck heads-up buy-in (USDC, Avalanche Fuji)',
    mimeType: 'application/json',
    maxTimeoutSeconds: 120,
    extra: { name: 'USD Coin', version: '2' },
  };
}

export function mountX402(app: Express): void {
  const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(config.rpcUrl) });

  // Step 1: client asks to pay -> we answer 402 with the requirements.
  app.get('/x402/buyin/:table', async (req: Request, res: Response) => {
    const table = req.params.table as Address;
    let buyIn = '0';
    try {
      buyIn = (
        (await publicClient.readContract({
          address: table,
          abi: pokerTableUsdcAbi,
          functionName: 'buyIn',
        })) as bigint
      ).toString();
    } catch {
      return res.status(404).json({ error: 'table not found' });
    }
    res.status(402).json({
      x402Version: 1,
      accepts: [requirements(table, buyIn)],
      error: 'payment required',
    });
  });

  // Step 2: client resends with X-PAYMENT (the signed EIP-3009 authorization) -> settle.
  app.post('/x402/buyin/:table', async (req: Request, res: Response) => {
    const table = req.params.table as Address;
    const header = req.header('X-PAYMENT');
    if (!header) {
      return res.status(402).json({ x402Version: 1, accepts: [requirements(table, '0')], error: 'X-PAYMENT required' });
    }

    let payload: Eip3009Payload;
    try {
      payload = decodePayment(header);
    } catch {
      return res.status(400).json({ error: 'malformed X-PAYMENT' });
    }

    // Option A: hand off to an external Avalanche x402 facilitator.
    if (FACILITATOR_URL) {
      try {
        const r = await fetch(`${FACILITATOR_URL.replace(/\/$/, '')}/settle`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements(table, payload.value) }),
        });
        const body = (await r.json()) as Record<string, unknown>;
        return res.status(r.ok ? 200 : 502).json({ via: 'facilitator', ...body });
      } catch (e) {
        return res.status(502).json({ error: 'facilitator settle failed', detail: String(e) });
      }
    }

    // Option B: self-facilitator — submit joinWithAuthorization with a relayer key.
    if (RELAYER_KEY) {
      try {
        const account = privateKeyToAccount(RELAYER_KEY as Hex);
        const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http(config.rpcUrl) });
        const hash = await wallet.writeContract({
          address: table,
          abi: pokerTableUsdcAbi,
          functionName: 'joinWithAuthorization',
          args: [
            payload.from,
            BigInt(payload.validAfter),
            BigInt(payload.validBefore),
            payload.nonce,
            payload.v,
            payload.r,
            payload.s,
          ],
        });
        return res.status(200).json({ via: 'self-facilitator', txHash: hash });
      } catch (e) {
        return res.status(502).json({ error: 'self-facilitator settle failed', detail: String(e) });
      }
    }

    return res.status(501).json({
      error: 'x402 settlement not configured',
      hint: 'set X402_FACILITATOR_URL (external) or X402_RELAYER_KEY (self-facilitator)',
    });
  });
}

interface Eip3009Payload {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
}

/** X-PAYMENT is base64(JSON). We carry the EVM "exact" EIP-3009 authorization inside. */
function decodePayment(header: string): Eip3009Payload {
  const json = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  const a = json.payload?.authorization ?? json.authorization ?? json;
  return {
    from: a.from,
    to: a.to,
    value: String(a.value),
    validAfter: String(a.validAfter ?? 0),
    validBefore: String(a.validBefore ?? Math.floor(Date.now() / 1000) + 120),
    nonce: a.nonce,
    v: Number(a.v),
    r: a.r,
    s: a.s,
  };
}
