import { NpyViewer } from './components/NpyViewer';

function App() {
  return (
    <div className="w-full min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-6xl flex flex-col items-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">NPY File Viewer</h1>
        <NpyViewer />
      </div>
    </div>
  );
}

export default App;
