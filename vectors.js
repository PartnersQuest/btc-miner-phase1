/**
 * vectors.js
 *
 * Known-answer test vectors for SHA256d, computed independently offline
 * with Python's hashlib (a completely separate implementation from the
 * browser's Web Crypto), then copied here programmatically — not retyped
 * by hand — to eliminate transcription errors.
 */
export const SHA256D_TEST_VECTORS = [
  {
    label: 'empty string',
    inputHex: '',
    expected: '5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456'
  },
  {
    label: '"abc"',
    inputHex: '616263',
    expected: '4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358'
  },
  {
    label: '"hello"',
    inputHex: '68656c6c6f',
    expected: '9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50'
  },
  {
    label: '80 zero bytes (header-sized)',
    inputHex:
      '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    expected: '4be7570e8f70eb093640c8468274ba759745a7aa2b7d25ab1e0421b259845014'
  }
];
