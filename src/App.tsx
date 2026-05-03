import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

const theme = createTheme({
  palette: { mode: 'light' },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            OF Ratings
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 'calc(100vh - 64px)',
            gap: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="h2">Hello, old fashioneds.</Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Brad and Kyle's ratings, mapped.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label="Brad" color="primary" />
            <Chip label="Kyle" color="secondary" />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Phase 0 • coming soon
          </Typography>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App
