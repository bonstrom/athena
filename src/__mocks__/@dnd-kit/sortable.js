const React = require('react');

function SortableContext({ children }) {
  return React.createElement(React.Fragment, null, children);
}

function useSortable() {
  return {
    attributes: {},
    listeners: {},
    setNodeRef: function () {},
    transform: null,
    transition: undefined,
    isDragging: false,
  };
}

function sortableKeyboardCoordinates() {}
function horizontalListSortingStrategy() {}

module.exports = {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
};
