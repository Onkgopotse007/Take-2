import { randomInt as cryptoRandomInt } from 'node:crypto';
import { randomInt, type Rng } from '@take2/engine';

/**
 * Cryptographic RNG for live games. A small seeded RNG could be brute-forced from an observed
 * deal, which would let a player predict the draw pile.
 */
export const cryptoRng: Rng = {
  next: () => cryptoRandomInt(0, 2 ** 32) / 2 ** 32,
};

/** No 0/O, 1/I/L, so codes are easy to read out loud and type on a phone. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function generateCode(rng: Rng = cryptoRng): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(rng, CODE_ALPHABET.length)];
  return code;
}

/** Normalises a code typed by a player: upper case, no spaces. */
export function normaliseCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}
