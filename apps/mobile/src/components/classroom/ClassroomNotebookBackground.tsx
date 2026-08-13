import React from 'react';
import {View} from 'react-native';
import Svg, {Defs, Line, Pattern, Rect} from 'react-native-svg';
import type {CsNotebookStyle} from '../../types/classroom';

export function ClassroomNotebookBackground({
  width,
  height,
  style,
  theme,
}: {
  width: number;
  height: number;
  style: CsNotebookStyle;
  theme: 'light' | 'dark';
}) {
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#232733' : '#ffffff';
  // Web bilan bir xil: grid uchun 0.12, lined uchun 0.14 (classroomCanvasDraw.ts).
  const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(148, 163, 184, 0.12)';
  const linedLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(148, 163, 184, 0.14)';

  if (width <= 0 || height <= 0) {
    return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
  }

  if (style === 'plain') {
    return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
  }

  const cellSize = width / 24;
  const lineSpacing = width / 22;

  if (style === 'grid') {
    return (
      <Svg width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
        <Defs>
          <Pattern
            id="notebook-grid-pattern"
            width={cellSize}
            height={cellSize}
            patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={cellSize} y2="0" stroke={gridLineColor} strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2={cellSize} stroke={gridLineColor} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={bgColor} />
        <Rect width={width} height={height} fill="url(#notebook-grid-pattern)" />
      </Svg>
    );
  }

  if (style === 'lined') {
    return (
      <Svg width={width} height={height} style={{position: 'absolute', top: 0, left: 0}}>
        <Defs>
          <Pattern
            id="notebook-lined-pattern"
            width={width}
            height={lineSpacing}
            patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2={width} y2="0" stroke={linedLineColor} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={bgColor} />
        <Rect width={width} height={height} fill="url(#notebook-lined-pattern)" />
      </Svg>
    );
  }

  return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
}
