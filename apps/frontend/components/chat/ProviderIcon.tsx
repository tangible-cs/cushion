'use client';

import type { SVGProps } from 'react';
import type { IconName } from './provider-icons/types';

const sprite = '/provider-icons/sprite.svg';

export type ProviderIconProps = Omit<SVGProps<SVGSVGElement>, 'id'> & {
  id: IconName;
};

export function ProviderIcon({ id, className, ...rest }: ProviderIconProps) {
  return (
    <svg data-component="provider-icon" {...rest} className={className}>
      <use href={`${sprite}#${id}`} />
    </svg>
  );
}
