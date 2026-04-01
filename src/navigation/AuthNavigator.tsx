/**
 * AuthNavigator — stack shown when no session exists.
 * SignIn is the initial screen; SignUp is pushed on top.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CapacityScreen from '../screens/auth/CapacityScreen';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  Capacity: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="Capacity" component={CapacityScreen} />
    </Stack.Navigator>
  );
}
