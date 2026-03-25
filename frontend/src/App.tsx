import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import UploadPage from './pages/UploadPage';
import { ConversionProvider, useConversionState } from './context/ConversionContext';
import { useSessionCleanup } from './hooks/useSessionCleanup';

function AppInner() {
  const { isConverting } = useConversionState();
  useSessionCleanup(isConverting);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<UploadPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <ConversionProvider>
      <AppInner />
    </ConversionProvider>
  );
}

export default App;
