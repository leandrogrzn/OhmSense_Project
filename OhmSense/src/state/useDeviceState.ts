import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { createDeviceService } from "../services";
import type { DeviceService } from "../services";
import type { ConnectionState, DeviceData } from "../types/device";
import {
  canRequestMeasurement,
  deviceReducer,
  initialDeviceState,
  isConnectionInProgress,
  isConnected,
} from "./deviceReducer";

export interface UseDeviceStateResult {
  data: DeviceData | null;
  connectionState: ConnectionState;
  error: string | null;
  isBusy: boolean;
  canMeasure: boolean;
  isDeviceConnected: boolean;
  measure: () => Promise<void>;
  toggleConnection: () => Promise<void>;
}

export function useDeviceState(service?: DeviceService): UseDeviceStateResult {
  const [state, dispatch] = useReducer(deviceReducer, initialDeviceState);
  const [deviceService] = useState<DeviceService>(() => service ?? createDeviceService());
  const mounted = useRef(true);
  const connectionRun = useRef(0);
  const measurementRun = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = deviceService.subscribe((data) => {
      if (!cancelled) {
        dispatch({ type: "DATA_UPDATED", data });
      }
    });

    deviceService.setEventHandler((event) => {
      if (cancelled) {
        return;
      }
      // Invalidate any in-flight run so a connect or measurement that settles
      // after an unsolicited drop cannot resurrect a stale CONNECTED state.
      connectionRun.current += 1;
      measurementRun.current += 1;

      if (event.type === "DISCONNECTED") {
        dispatch({ type: "DISCONNECTED" });
      } else {
        dispatch({ type: "FAILED", message: event.message });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      deviceService.setEventHandler(null);
      deviceService.dispose();
    };
  }, [deviceService]);

  const toggleConnection = useCallback(async () => {
    if (isConnected(state.connectionState) || isConnectionInProgress(state.connectionState)) {
      connectionRun.current += 1;
      measurementRun.current += 1;
      await deviceService.disconnect();
      if (mounted.current) {
        dispatch({ type: "DISCONNECTED" });
      }
      return;
    }

    const run = connectionRun.current + 1;
    connectionRun.current = run;
    const isStale = () => !mounted.current || connectionRun.current !== run;

    dispatch({ type: "CONNECT_REQUESTED" });

    try {
      await deviceService.connect((phase) => {
        if (phase === "connecting" && !isStale()) {
          dispatch({ type: "SERVICE_CONNECTING" });
        }
      });
      if (!isStale()) {
        dispatch({ type: "CONNECTED" });
      }
    } catch (error) {
      if (!isStale()) {
        dispatch({
          type: "FAILED",
          message: error instanceof Error ? error.message : "Error de conexión",
        });
      }
    }
  }, [deviceService, state.connectionState]);

  const measure = useCallback(async () => {
    if (!canRequestMeasurement(state)) {
      return;
    }

    const run = measurementRun.current + 1;
    measurementRun.current = run;
    const isStale = () => !mounted.current || measurementRun.current !== run;

    dispatch({ type: "MEASURE_REQUESTED" });

    try {
      const data = await deviceService.requestMeasurement();
      if (!isStale()) {
        dispatch({ type: "MEASUREMENT_RECEIVED", data });
      }
    } catch (error) {
      if (!isStale()) {
        dispatch({
          type: "FAILED",
          message: error instanceof Error ? error.message : "Error de medición",
        });
      }
    }
  }, [deviceService, state]);

  const isBusy =
    isConnectionInProgress(state.connectionState) || state.connectionState === "MEASURING";

  return useMemo(
    () => ({
      data: state.data,
      connectionState: state.connectionState,
      error: state.error,
      isBusy,
      canMeasure: canRequestMeasurement(state),
      isDeviceConnected: isConnected(state.connectionState),
      measure,
      toggleConnection,
    }),
    [state, isBusy, measure, toggleConnection],
  );
}
