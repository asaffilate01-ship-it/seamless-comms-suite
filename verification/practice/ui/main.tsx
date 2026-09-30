import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import {PracticeWorkspace} from '../../../src/modules/practice/workspace';
import '../../../src/styles.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PracticeWorkspace/><Toaster/></QueryClientProvider>);
