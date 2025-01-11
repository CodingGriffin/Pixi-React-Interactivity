import { NpyViewer } from './components/NpyViewer';

function App() {
  return (
    <div className="w-full min-h-screen bg-white p-8">
      <div className="w-full max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 text-center mb-8">PIXI React Interactivity</h1>
        <NpyViewer />
      </div>
    </div>
  );
}

export default App;
