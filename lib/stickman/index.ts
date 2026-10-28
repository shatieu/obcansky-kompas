/**
 * Panáček online demonstrace (SPEC-demonstrace §5). Čisté funkce, bez DOM – použitelné
 * na serveru (next/og), v Reactu i v PixiJS davu. Kreslení do canvasu je v ./canvas.
 */
export { mulberry32, hash32 } from "./prng";
export {
  generateStickman,
  isPose,
  isSignColor,
  HAIR_STYLES,
  POSES,
  RANGES,
  SIGN_COLORS,
  SIGN_SHAPES,
  type Hair,
  type Pose,
  type SignColor,
  type SignShape,
  type StickmanParams,
} from "./params";
export { poseAt, loopMs, cycle, POSE_PERIOD, LOOP_MIN, LOOP_MAX } from "./poses";
export {
  figureGeometry,
  BODY,
  HEAD_LIMITS,
  SIGN_SIZE,
  STROKE,
  VIEWBOX,
  type Figure,
  type PoseAngles,
  type Seg,
} from "./geometry";
export {
  layoutSignText,
  estimateWidth,
  PALETTE_CSS,
  PALETTE_DARK,
  PALETTE_LIGHT,
  SIGN_FONT,
  SIGN_FONT_WEIGHT,
  SIGN_LINE_HEIGHT,
  SIGN_MAX_LINES,
  type MeasureText,
  type SignTextLayout,
  type StickmanPalette,
} from "./sign";
export { stickmanSvg, stickmanLayout, figureSvg, escapeXml, DEFAULT_SIGN_FONT, type StickmanSvgOptions } from "./svg";
