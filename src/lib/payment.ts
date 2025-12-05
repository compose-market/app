/**
 * x402 Payment Utilities
 * 
 * Handles signature normalization for Avalanche Fuji compatibility.
 */

const AVALANCHE_FUJI_CHAIN_ID = 43113;

/**
 * Normalizes ECDSA signature v value to legacy format (27/28)
 * 
 * Wallets may produce signatures with different v value formats:
 * - yParity: 0 or 1
 * - Legacy: 27 or 28  
 * - EIP-155: chainId * 2 + 35 + yParity
 */
function normalizeSignatureV(signature: string, chainId: number): string {
  const vHex = signature.slice(130);
  const vValue = parseInt(vHex, 16);

  let normalizedV: number;

  if (vValue === 0 || vValue === 1) {
    normalizedV = vValue + 27;
  } else if (vValue === 27 || vValue === 28) {
    normalizedV = vValue;
  } else if (vValue >= 35) {
    const yParity = (vValue - 35 - chainId * 2) % 2;
    normalizedV = yParity + 27;
  } else {
    console.warn('Unexpected v value:', vValue);
    normalizedV = vValue;
  }

  return signature.slice(0, 130) + normalizedV.toString(16).padStart(2, '0');
}

/**
 * Creates a fetch wrapper that normalizes payment signatures for Avalanche Fuji
 */
export function createNormalizedFetch(chainId: number = AVALANCHE_FUJI_CHAIN_ID): typeof fetch {
  return async (input, init) => {
    let paymentHeader: string | null = null;
    
    if (init?.headers instanceof Headers) {
      paymentHeader = init.headers.get('x-payment') || init.headers.get('X-PAYMENT');
    } else if (typeof init?.headers === 'object' && init.headers !== null) {
      const headers = init.headers as Record<string, string>;
      paymentHeader = headers['x-payment'] || headers['X-PAYMENT'];
    }

    if (paymentHeader) {
      try {
        const decoded = JSON.parse(atob(paymentHeader));

        if (decoded.payload?.signature) {
          const normalizedSig = normalizeSignatureV(decoded.payload.signature, chainId);
          decoded.payload.signature = normalizedSig;
          const normalizedPaymentHeader = btoa(JSON.stringify(decoded));

          if (init?.headers instanceof Headers) {
            init.headers.set('X-PAYMENT', normalizedPaymentHeader);
          } else if (typeof init?.headers === 'object' && init.headers !== null) {
            const headers = init.headers as Record<string, string>;
            delete headers['x-payment'];
            delete headers['X-PAYMENT'];
            headers['X-PAYMENT'] = normalizedPaymentHeader;
          }
        }
      } catch (e) {
        console.error('Failed to normalize payment:', e);
      }
    }

    return fetch(input, init);
  };
}

