import SaideBar from './components/SaideBar'
import { ThemeProvider } from './components/theme-provider'

function App(): React.JSX.Element {
  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div>
          <SaideBar />
        </div>
      </ThemeProvider>
    </>
  )
}

export default App
