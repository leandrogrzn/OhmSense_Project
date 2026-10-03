import { resistance as resistanceConfig } from "../constants/config";

export interface FormatResistanceOptions {
  precision?: number;
}

export interface FormattedResistance {
  value: string;
  unit: string;
}

function clampPrecision(precision: number): number {
  if (!Number.isFinite(precision)) {
    return resistanceConfig.defaultPrecision;
  }
  return Math.min(20, Math.max(0, Math.trunc(precision)));
}

function stripTrailingZeros(fixed: string): string {
  if (!fixed.includes(".")) {
    return fixed;
  }
  return fixed.replace(/\.?0+$/, "");
}

export function formatResistance(
  ohms: number,
  options: FormatResistanceOptions = {},
): FormattedResistance {
  const precision = clampPrecision(options.precision ?? resistanceConfig.defaultPrecision);

  if (!Number.isFinite(ohms)) {
    return { value: "", unit: "" };
  }

  if (Math.abs(ohms) < resistanceConfig.milliOhmThreshold) {
    return {
      value: stripTrailingZeros((ohms * 1000).toFixed(precision)),
      unit: resistanceConfig.unitMilliOhm,
    };
  }

  return {
    value: ohms.toFixed(precision),
    unit: resistanceConfig.unitOhm,
  };
}

export function formatResistanceValue(
  ohms: number | null,
  options: FormatResistanceOptions = {},
): string {
  if (ohms === null) {
    return "";
  }
  const { value, unit } = formatResistance(ohms, options);
  return unit ? `${value} ${unit}` : value;
}
