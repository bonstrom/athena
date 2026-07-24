import React from 'react';

const MockBarChart: React.FC = () => React.createElement('div', null);
MockBarChart.displayName = 'BarChart';

const MockLineChart: React.FC = () => React.createElement('div', null);
MockLineChart.displayName = 'LineChart';

const MockPieChart: React.FC = () => React.createElement('div', null);
MockPieChart.displayName = 'PieChart';

export { MockBarChart as BarChart, MockLineChart as LineChart, MockPieChart as PieChart };
export default {};
