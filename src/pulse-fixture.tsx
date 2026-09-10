import React from 'react';
import { createRoot } from 'react-dom/client';
import { PulseResultsPanel } from './components/pulses/PulseResultsPanel';
import './index.css';
createRoot(document.getElementById('root')!).render(<PulseResultsPanel survey={{id:'survey',title:'Check-in semanal de bem-estar',kind:'self',created_by:'admin',anonymous:false} as any}/>);
