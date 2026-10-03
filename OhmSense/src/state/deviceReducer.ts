import type { ConnectionState, DeviceAction, DeviceState } from "../types/device";

export const initialDeviceState: DeviceState = {
  connectionState: "DISCONNECTED",
  data: null,
  error: null,
};

export const MEASURABLE_STATES: readonly ConnectionState[] = [
  "CONNECTED",
  "MEASUREMENT_RECEIVED",
];

export function canRequestMeasurement(state: DeviceState): boolean {
  return MEASURABLE_STATES.includes(state.connectionState);
}

export function isConnectionInProgress(state: ConnectionState): boolean {
  return state === "SCANNING" || state === "CONNECTING";
}

export function isConnected(state: ConnectionState): boolean {
  return (
    state === "CONNECTED" || state === "MEASURING" || state === "MEASUREMENT_RECEIVED"
  );
}

export function deviceReducer(state: DeviceState, action: DeviceAction): DeviceState {
  switch (action.type) {
    case "CONNECT_REQUESTED":
      if (isConnectionInProgress(state.connectionState) || isConnected(state.connectionState)) {
        return state;
      }
      return { ...state, connectionState: "SCANNING", error: null };

    case "SERVICE_CONNECTING":
      if (state.connectionState !== "SCANNING") {
        return state;
      }
      return { ...state, connectionState: "CONNECTING" };

    case "CONNECTED":
      return { ...state, connectionState: "CONNECTED", error: null };

    case "DISCONNECTED":
      return { ...initialDeviceState, data: state.data };

    case "MEASURE_REQUESTED":
      if (!canRequestMeasurement(state)) {
        return state;
      }
      return { ...state, connectionState: "MEASURING", error: null };

    case "MEASUREMENT_RECEIVED":
      return {
        ...state,
        connectionState: "MEASUREMENT_RECEIVED",
        data: action.data,
        error: null,
      };

    case "DATA_UPDATED":
      if (state.data === null) {
        return state;
      }
      return { ...state, data: action.data };

    case "FAILED":
      return {
        ...state,
        connectionState: "ERROR",
        error: action.message,
      };

    default:
      return state;
  }
}
