import React from 'react';
import ReactDOM from 'react-dom/client';
import '../app/globals.css';
import 'katex/dist/katex.min.css';
import Home from './Home';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
