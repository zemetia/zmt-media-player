import React from 'react';

interface VideoSvgFiltersProps {
  gamma?: number;
}

export const VideoSvgFilters: React.FC<VideoSvgFiltersProps> = ({ gamma = 1.0 }) => {
  const safeGamma = Math.max(0.5, Math.min(2.0, gamma));
  const exponent = (1 / safeGamma).toFixed(3);

  return (
    <svg className="hidden w-0 h-0 absolute pointer-events-none" aria-hidden="true">
      <defs>
        {/* Hardware Edge Sharpness Filters via Convolution Matrix */}
        <filter id="zmt-sharpness-subtle">
          <feConvolveMatrix
            order="3"
            kernelMatrix="0 -0.5 0 -0.5 3 -0.5 0 -0.5 0"
            preserveAlpha="true"
          />
        </filter>

        <filter id="zmt-sharpness-medium">
          <feConvolveMatrix
            order="3"
            kernelMatrix="0 -1 0 -1 5 -1 0 -1 0"
            preserveAlpha="true"
          />
        </filter>

        <filter id="zmt-sharpness-high">
          <feConvolveMatrix
            order="3"
            kernelMatrix="-0.5 -1 -0.5 -1 7 -1 -0.5 -1 -0.5"
            preserveAlpha="true"
          />
        </filter>

        {/* Dynamic Gamma Midtones Adjustment */}
        <filter id="zmt-gamma-filter">
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent={exponent} />
            <feFuncG type="gamma" amplitude="1" exponent={exponent} />
            <feFuncB type="gamma" amplitude="1" exponent={exponent} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
};
