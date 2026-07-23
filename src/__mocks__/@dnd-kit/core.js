const React = require('react');

function DndContext({ children }) {
  return React.createElement(React.Fragment, null, children);
}

module.exports = {
  DndContext,
  closestCenter: function () {},
  KeyboardSensor: function () {},
  PointerSensor: function () {},
  TouchSensor: function () {},
  useSensor: function () {
    return {};
  },
  useSensors: function () {
    return [];
  },
};
