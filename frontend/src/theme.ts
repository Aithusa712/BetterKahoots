import { createTheme, type ThemeOptions } from '@mui/material/styles'

const catppuccinMocha = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  subtext0: '#a6adc8',
  overlay2: '#9399b2',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
} as const

const themeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: { main: catppuccinMocha.mauve },
    secondary: { main: catppuccinMocha.sky },
    background: {
      default: catppuccinMocha.base,
      paper: catppuccinMocha.surface0,
    },
    text: {
      primary: catppuccinMocha.text,
      secondary: catppuccinMocha.subtext0,
    },
    success: { main: catppuccinMocha.green },
    error: { main: catppuccinMocha.red },
    warning: { main: catppuccinMocha.peach },
    info: { main: catppuccinMocha.sky },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontWeightMedium: 600,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'radial-gradient(circle at top left, rgba(203, 166, 247, 0.18), transparent 45%), radial-gradient(circle at bottom right, rgba(137, 220, 235, 0.18), transparent 40%)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: catppuccinMocha.surface0,
          border: `1px solid ${catppuccinMocha.surface1}`,
        },
      },
    },
  },
}

const theme = createTheme(themeOptions)

export default theme
export { catppuccinMocha }
