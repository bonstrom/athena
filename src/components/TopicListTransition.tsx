import { Collapse, CollapseProps } from '@mui/material';
import { JSX, ReactNode } from 'react';

export interface TopicListTransitionProps extends Pick<CollapseProps, 'in' | 'onEntered' | 'onExited'> {
  children: ReactNode;
  topicIds: readonly string[];
  animateEnter?: boolean;
  animateExit?: boolean;
  reducedMotion: boolean;
}

/** Retains a removed row until its visual exit completes; never delays store updates. */
const TopicListTransition = ({
  children,
  in: visible = false,
  animateEnter = false,
  animateExit = false,
  reducedMotion,
  onEntered,
  onExited,
}: TopicListTransitionProps): JSX.Element => (
  <Collapse
    component="li"
    in={visible}
    appear={animateEnter && !reducedMotion}
    timeout={{ enter: !reducedMotion && animateEnter ? 300 : 0, exit: !reducedMotion && animateExit ? 220 : 0 }}
    onEntered={onEntered}
    onExited={onExited}
    className={visible && !reducedMotion && animateEnter ? 'athena-topic-enter' : undefined}
    inert={!visible}
    sx={{
      listStyle: 'none',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? undefined : 'none',
      transitionProperty: 'height, opacity',
      transitionTimingFunction: 'ease-out',
    }}>
    {children}
  </Collapse>
);

export default TopicListTransition;
