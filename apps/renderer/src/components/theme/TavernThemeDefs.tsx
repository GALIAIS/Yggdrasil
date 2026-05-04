export function TavernThemeDefs() {
  return (
    <svg
      aria-hidden="true"
      className="tavern-theme-defs"
      focusable="false"
      height="0"
      width="0"
    >
      <defs>
        <filter id="tavern-grain" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.85" numOctaves="2" result="noise" type="fractalNoise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0 0.04  0 0 0 0.18 0"
          />
        </filter>

        <filter id="tavern-leather" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence baseFrequency="0.04 0.018" numOctaves="3" result="noise" type="fractalNoise" />
          <feDiffuseLighting in="noise" lightingColor="#5a4230" result="light" surfaceScale="2.4">
            <feDistantLight azimuth="78" elevation="42" />
          </feDiffuseLighting>
          <feBlend in="light" in2="SourceGraphic" mode="multiply" />
        </filter>

        <filter id="tavern-parchment" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.014" numOctaves="4" result="clouds" type="fractalNoise" />
          <feDiffuseLighting in="clouds" lightingColor="#fff4dc" result="bump" surfaceScale="2.2">
            <feDistantLight azimuth="52" elevation="36" />
          </feDiffuseLighting>
          <feColorMatrix
            in="clouds"
            result="stains"
            type="matrix"
            values="0 0 0 0 0.84  0 0 0 0 0.74  0 0 0 0 0.56  0 0 0 0.22 0"
          />
          <feBlend in="bump" in2="stains" mode="multiply" result="paper" />
          <feTurbulence baseFrequency="0.42" numOctaves="1" result="fiber" type="fractalNoise" />
          <feColorMatrix
            in="fiber"
            result="fiberShade"
            type="matrix"
            values="0 0 0 0 0.12  0 0 0 0 0.1  0 0 0 0 0.06  0 0 0 0.07 0"
          />
          <feBlend in="paper" in2="fiberShade" mode="multiply" />
        </filter>

        <filter id="tavern-stone" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence baseFrequency="0.12" numOctaves="2" result="noise" type="fractalNoise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 0.32 0"
          />
        </filter>

        <filter id="tavern-brushed-gold" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence baseFrequency="0.008 0.55" numOctaves="2" result="noise" type="fractalNoise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="1 0 0 0 0.12  0 1 0 0 0.09  0 0 1 0 0.04  0 0 0 0.34 0"
          />
        </filter>

        <filter id="tavern-dark-metal" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence baseFrequency="0.012 0.42" numOctaves="2" result="noise" type="fractalNoise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="1 0 0 0 0.05  0 1 0 0 0.04  0 0 1 0 0.03  0 0 0 0.28 0"
          />
        </filter>

        <filter id="tavern-engraved-trim" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence baseFrequency="0.18" numOctaves="1" result="noise" type="fractalNoise" />
          <feDiffuseLighting in="noise" lightingColor="#c8a46d" result="light" surfaceScale="1.2">
            <feDistantLight azimuth="72" elevation="40" />
          </feDiffuseLighting>
          <feColorMatrix
            in="light"
            type="matrix"
            values="1 0 0 0 0.08  0 1 0 0 0.05  0 0 1 0 0.02  0 0 0 0.34 0"
          />
        </filter>
      </defs>
    </svg>
  )
}
