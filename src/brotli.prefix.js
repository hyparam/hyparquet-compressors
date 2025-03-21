/* Copyright 2013 Google Inc. All Rights Reserved.
   Lookup tables to map prefix codes to value ranges. This is used during
   decoding of the block lengths, literal insertion lengths and copy lengths.
*/

/**
 * Represents the range of values belonging to a prefix code:
 * [offset, offset + 2^nbits)
 * @param {number[]} pair
 * @returns {{offset: number, nbits: number}}
 */
function prefix([ offset, nbits ]) {
  return { offset, nbits }
}

export const kBlockLengthPrefixCode = [
  [1, 2], [5, 2], [9, 2], [13, 2],
  [17, 3], [25, 3], [33, 3], [41, 3],
  [49, 4], [65, 4], [81, 4], [97, 4],
  [113, 5], [145, 5], [177, 5], [209, 5],
  [241, 6], [305, 6], [369, 7], [497, 8],
  [753, 9], [1265, 10], [2289, 11], [4337, 12],
  [8433, 13], [16625, 24],
].map(prefix)

export const kInsertLengthPrefixCode = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [4, 0], [5, 0], [6, 1], [8, 1],
  [10, 2], [14, 2], [18, 3], [26, 3],
  [34, 4], [50, 4], [66, 5], [98, 5],
  [130, 6], [194, 7], [322, 8], [578, 9],
  [1090, 10], [2114, 12], [6210, 14], [22594, 24],
].map(prefix)

export const kCopyLengthPrefixCode = [
  [2, 0], [3, 0], [4, 0], [5, 0],
  [6, 0], [7, 0], [8, 0], [9, 0],
  [10, 1], [12, 1], [14, 2], [18, 2],
  [22, 3], [30, 3], [38, 4], [54, 4],
  [70, 5], [102, 5], [134, 6], [198, 7],
  [326, 8], [582, 9], [1094, 10], [2118, 24],
].map(prefix)

export const kInsertRangeLut = [
  0, 0, 8, 8, 0, 16, 8, 16, 16,
]

export const kCopyRangeLut = [
  0, 8, 0, 8, 16, 0, 16, 8, 16,
]
