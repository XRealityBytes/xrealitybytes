import type { CapabilityReport } from './types';

function hasWebGL2Context(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2');
  return Boolean(context);
}

export async function detectCapabilities(): Promise<CapabilityReport> {
  const hasNavigatorGpu =
    typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);

  const report: CapabilityReport = {
    tier: 'static',
    hasNavigatorGpu,
    webgpu: {
      available: false,
    },
    webgl2: {
      available: hasWebGL2Context(),
    },
  };

  if (hasNavigatorGpu) {
    try {
      const nav = navigator as Navigator & {
        gpu: {
          requestAdapter: () => Promise<
            | {
                requestDevice: () => Promise<{ destroy?: () => void }>;
                info?: {
                  architecture?: string;
                  description?: string;
                  vendor?: string;
                  device?: string;
                };
              }
            | null
          >;
        };
      };

      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        device.destroy?.();

        report.webgpu.available = true;
        report.webgpu.adapterName = adapter.info?.device;
        report.webgpu.architecture = adapter.info?.architecture;
        report.webgpu.description = adapter.info?.description;
        report.webgpu.vendor = adapter.info?.vendor;
      } else {
        report.webgpu.reason = 'Adapter request returned null.';
      }
    } catch (error) {
      report.webgpu.reason = error instanceof Error ? error.message : 'Unknown WebGPU adapter/device failure.';
    }
  } else {
    report.webgpu.reason = 'navigator.gpu is unavailable.';
  }

  if (report.webgpu.available) {
    report.tier = 'webgpu';
  } else if (report.webgl2.available) {
    report.tier = 'webgl2';
  }

  return report;
}
