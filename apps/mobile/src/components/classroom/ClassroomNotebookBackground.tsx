import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, Defs, Line, Pattern, Rect} from 'react-native-svg';
import type {CsNotebookStyle} from '../../types/classroom';

export function ClassroomNotebookBackground({
  width,
  height,
  style,
  pageIndex = 0,
  theme = 'light',
}: {
  width: number;
  height: number;
  style: CsNotebookStyle;
  pageIndex?: number;
  theme?: 'light' | 'dark';
}) {
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#232733' : '#ffffff';
  const gridLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(148, 163, 184, 0.12)';
  const linedLineColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(148, 163, 184, 0.14)';
  const dotColor = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(148, 163, 184, 0.25)';

  if (width <= 0 || height <= 0 || style === 'plain') {
    return <View style={{width: '100%', height: '100%', backgroundColor: bgColor}} />;
  }

  const cellSize = width / 24;
  const lineSpacing = width / 22;

  if (style === 'grid') {
    const patternId = `notebook-grid-pattern-${pageIndex}-${theme}`;
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
    const patternId = `notebook-lined-pattern-${pageIndex}-${theme}`;
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
    const patternId = `notebook-dots-pattern-${pageIndex}-${theme}`;
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
