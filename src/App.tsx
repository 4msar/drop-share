import { BrowserRouter, Route, Routes } from "react-router";
import { AppProviders } from "./contexts/AppProviders";
import UploadPage from "./routes/UploadPage";
import ViewerPage from "./routes/ViewerPage";

/*
 * Only directory URLs reach this router. `/a/:id/<file>` is served as raw
 * bytes by the Worker, so the browser treats it as a document/subresource
 * request and React never sees it - which is what keeps uploaded files out
 * of this app's origin.
 */
export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/a/:id/*" element={<ViewerPage />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
