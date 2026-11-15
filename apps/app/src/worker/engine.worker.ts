import { expose } from 'comlink';
import { runCompare, runTextDiff } from './engine';

expose({ runCompare, runTextDiff });
