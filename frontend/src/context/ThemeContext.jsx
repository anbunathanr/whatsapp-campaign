import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext(null);

export const ThemeContextProvider = ({ children }) => {
  // TODO: Implement context state and logic
  return (
    <ThemeContext.Provider value={{}}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);

export default ThemeContext;
