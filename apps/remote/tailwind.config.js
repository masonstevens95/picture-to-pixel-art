/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // U8 indeterminate-progress animations.
      keyframes: {
        // ModelLoadIndicator: a 1/3-width sliver oscillates left↔right
        // across an indeterminate track.
        modelLoadShimmer: {
          "0%": { transform: "translateX(0%)" },
          "50%": { transform: "translateX(200%)" },
          "100%": { transform: "translateX(0%)" },
        },
        // FirstRenderSpinner: classic 360° rotation. Tailwind ships
        // `animate-spin` already, but we keep this here in case a future
        // restyle wants a custom curve without forking utility classes.
      },
    },
  },
  plugins: [],
};
