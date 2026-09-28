import { useEffect, useRef, useState } from 'react';

export function usePriceFlash(value: number | undefined) {
  const [flashClass, setFlashClass] = useState<string>('');
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== undefined && prevValue.current !== undefined) {
      if (value > prevValue.current) {
        setFlashClass('flash-up');
      } else if (value < prevValue.current) {
        setFlashClass('flash-down');
      }
      
      const timer = setTimeout(() => {
        setFlashClass('');
      }, 300);
      
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  return flashClass;
}
