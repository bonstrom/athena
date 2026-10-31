import React from 'react';

interface MockAxis {
  data?: ReadonlyArray<unknown>;
}

interface MockChartProps {
  xAxis?: ReadonlyArray<MockAxis>;
}

function renderAxisLabels(xAxis: ReadonlyArray<MockAxis> | undefined): React.ReactNode {
  if (!xAxis) return null;
  return xAxis.flatMap((axis, axisIndex) =>
    (axis.data ?? []).map((value, valueIndex) =>
      React.createElement('span', { key: `${axisIndex}-${valueIndex}` }, String(value)),
    ),
  );
}

const MockBarChart: React.FC<MockChartProps> = ({ xAxis }) => React.createElement('div', null, renderAxisLabels(xAxis));
MockBarChart.displayName = 'BarChart';

const MockLineChart: React.FC<MockChartProps> = ({ xAxis }) => React.createElement('div', null, renderAxisLabels(xAxis));
MockLineChart.displayName = 'LineChart';

const MockPieChart: React.FC = () => React.createElement('div', null);
MockPieChart.displayName = 'PieChart';

export { MockBarChart as BarChart, MockLineChart as LineChart, MockPieChart as PieChart };
export default {};
