/** Dimensions of the streamed road + terrain mesh around the player. */

/** Rows of the terrain mesh along the road (z). */
export const Z_SEGMENTS = 230;
/** Columns across the road (x). */
export const X_SEGMENTS = 76;
/** Metres per terrain row. */
export const SEGMENT_LEN = 5.5;
/** Metres of road covered by the mesh (and by the recycled scenery pool). */
export const TOTAL_LENGTH = Z_SEGMENTS * SEGMENT_LEN;
/** Metres from the road centre to the mesh edge. */
export const HALF_WIDTH = 520;
/** Size of the recycled roadside scenery pool. */
export const SCENERY_COUNT = 96;
