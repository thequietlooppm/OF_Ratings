import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import type { Rating, Meta } from './types/rating'
import ratingsData from './data/ratings.json'
import metaData from './data/meta.json'

const ratings = (ratingsData as Rating[]).filter(r => r.hasCoords)
const meta = metaData as Meta

const theme = createTheme({ palette: { mode: 'light' } })

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            OF Ratings
          </Typography>
          {meta.lastSyncedAt && (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Synced {new Date(meta.lastSyncedAt).toLocaleDateString()}
            </Typography>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 3 }}>
        {ratings.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ mt: 8 }}>
            No ratings yet — run <code>npm run sync</code> to load data.
          </Typography>
        ) : (
          <List>
            {ratings.map(r => (
              <ListItem
                key={`${r.rater}-${r.locationName}`}
                divider
                alignItems="flex-start"
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        label={r.rater}
                        size="small"
                        color={r.rater === 'Brad' ? 'primary' : 'secondary'}
                      />
                      <Typography variant="body1" component="span">
                        {r.locationName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" component="span">
                        {r.rating}/10
                      </Typography>
                      {r.city && r.state && (
                        <Typography variant="caption" color="text.secondary" component="span">
                          {r.city}, {r.state}
                        </Typography>
                      )}
                    </Box>
                  }
                  secondary={r.notes}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Container>
    </ThemeProvider>
  )
}

export default App
