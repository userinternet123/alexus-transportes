// ─────────────────────────────────────────────────────────────────────────────
// TEMAS: la escala `green` (acento de todo el portal) y la escala `gray`
// apuntan a variables CSS definidas en src/styles/temas.css. Cambiar de tema
// o activar el modo oscuro cambia TODAS las pantallas sin tocar sus clases.
// ─────────────────────────────────────────────────────────────────────────────
const TONOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const escala = (prefijo) => Object.fromEntries(TONOS.map((t) => [t, `rgb(var(--${prefijo}-${t}) / <alpha-value>)`]))

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        green: escala('acento'),
        gray: escala('gris'),
        // La plantilla usa slate (gris azulado): sigue la misma escala y el modo oscuro
        slate: escala('gris'),
      },
      fontFamily: {
        // Fuente del sistema: SF Pro (Apple), Segoe UI Variable (Windows), Roboto (Android)
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI Variable Text"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        // Jerarquía de radios: control < tarjeta < superficie
        control: '8px',
        tarjeta: '12px',
        superficie: '16px',
      },
    },
  },
  plugins: [],
}
