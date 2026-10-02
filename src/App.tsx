import { BrowserRouter, Route, Routes } from "react-router";
import { AppProviders } from "./contexts/AppProviders";
import NotFoundPage from "./routes/NotFoundPage";
import UploadPage from "./routes/UploadPage";
import ViewerPage from "./routes/ViewerPage";

/*
 * Only directory URLs reach this router. `/a/:id/<file>` (and the share
 * route's `/s/:seg/<file>`) is served as raw bytes by the Worker, so the
 * browser treats it as a document/subresource request and React never sees
 * it - which is what keeps uploaded files out of this app's origin.
 */
export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/a/:id/*" element={<ViewerPage />} />
          {/* Read-only share links: /s/<id>/ (public) or /s/<id>.<shareToken>/ (private). */}
          <Route path="/s/:seg/*" element={<ViewerPage shared />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
