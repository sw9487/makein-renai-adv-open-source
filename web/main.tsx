import React from 'react';
import { createRoot } from 'react-dom/client';
import Game from './components/game';
import Editor from './components/editor';
import {GameEntry} from './components/game-entry';
import {I18nProvider} from './lib/i18n';
import {ThemeProvider} from './lib/theme';
import './app/globals.css';
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(
  <I18nProvider><ThemeProvider>{location.pathname.startsWith('/editor') ? <Editor /> : <GameEntry><Game /></GameEntry>}</ThemeProvider></I18nProvider>,
);
