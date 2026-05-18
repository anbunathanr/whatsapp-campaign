import { createContext, useContext, useState } from 'react';

const NotificationContext = createContext(null);

export const NotificationContextProvider = ({ children }) => {
  // TODO: Implement context state and logic
  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => useContext(NotificationContext);

export default NotificationContext;
