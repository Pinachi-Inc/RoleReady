// The only way the app turns a CV or cover letter into a document. The preview shows
// the PDF this returns, and the download saves the same bytes, so they cannot differ.
import { createElement as h } from 'react';
import { pdf } from '@react-pdf/renderer';
import { prepareCv, prepareLetter } from './prepare.js';
import * as classic from './styles/classic.js';

export const STYLES = { classic };
export const DEFAULT_STYLE = 'classic';
const pick = (style) => STYLES[style] || STYLES[DEFAULT_STYLE];

export const cvElement = (cv, style) => h(pick(style).CvDocument, { prepared: prepareCv(cv) });
export const letterElement = (letter, cv, style) => h(pick(style).LetterDocument, { prepared: prepareLetter(letter, cv) });

export const renderCvPdf = (cv, { style } = {}) => pdf(cvElement(cv, style)).toBlob();
export const renderLetterPdf = (letter, cv, { style } = {}) => pdf(letterElement(letter, cv, style)).toBlob();
