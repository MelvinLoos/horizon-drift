/** Camera modes, in cycle order (index = `state.cameraMode`). */
export const CAMERA_MODES = ['Chase Cam', 'Bonnet View', 'Cinema Drone'] as const;
export type CameraModeName = (typeof CAMERA_MODES)[number];
