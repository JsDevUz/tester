import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, Defs, Line, Pattern, Rect} from 'react-native-svg';
import type {CsNotebookStyle} from '../../types/classroom';

export function ClassroomNotebookBackground({
  width,
  height,
  style,
  pageIndex = 0,
}: {
  width: number;
  height: number;
  style: CsNotebookStyle;
  pageIndex?: number;
  theme?: 'light' | 'dark';
}) {
  // Web (ClassroomPdfViewer.tsx) bilan 100% bir xil: daftar varag'i har doim toza oq (#ffffff)
  const bgColor = '#ffffff';
  // Web bilan bir xil slating: grid uchun rgba(148, 163, 184, 0.12), lined uchun rgba(148, 163, 184, 0.14)
  const gridLineColor = 'rgba(148, 163, 184, 0.12)';
  const linedLineColor = 'rgba(148, 163, 184, 0.14)';
  const dotColor = 'rgba(148, 163, 184, 0.25)';

  if (width <= 0 || height <= 0 || style === 'plain') {
    return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
  }

  const cellSize = width / 24;
  const lineSpacing = width / 22;

  if (style === 'grid') {
    const patternId = `notebook-grid-pattern-${pageIndex}`;
    return (
      <Svg width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
        <Defs>
          <Pattern
            id={patternId}
            width={cellSize}
            height={cellSize}
            patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={cellSize} y2="0" stroke={gridLineColor} strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2={cellSize} stroke={gridLineColor} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={bgColor} />
        <Rect width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    );
  }

  if (style === 'lined') {
    const patternId = `notebook-lined-pattern-${pageIndex}`;
    return (
      <Svg width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
        <Defs>
          <Pattern
            id={patternId}
            width={width}
            height={lineSpacing}
            patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={width} y2="0" stroke={linedLineColor} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={bgColor} />
        <Rect width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    );
  }

  if (style === 'dots') {
    const patternId = `notebook-dots-pattern-${pageIndex}`;
    return (
      <Svg width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
        <Defs>
          <Pattern
            id={patternId}
            width={cellSize}
            height={cellSize}
            patternUnits="userSpaceOnUse">
            <Circle cx={cellSize / 2} cy={cellSize / 2} r="1" fill={dotColor} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={bgColor} />
        <Rect width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    );
  }

  return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
}
