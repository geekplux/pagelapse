import { defaultSample } from '../samples/index.ts';
import { SampleView } from './SampleView.tsx';

export function App() {
  return (
    <main>
      <h1>wayback-diff</h1>
      <SampleView fixture={defaultSample} />
    </main>
  );
}
