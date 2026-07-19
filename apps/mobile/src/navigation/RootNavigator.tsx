import React from'react';
import {createNativeStackNavigator}from'@react-navigation/native-stack';
import {createBottomTabNavigator}from'@react-navigation/bottom-tabs';
import {BookOpen,ClipboardList,MessageCircle,Radio,UserRound}from'lucide-react-native';
import {useAuthStore}from'../store/authStore';
import type{RootStackParamList,TabParamList}from'./types';
import {LoginScreen}from'../screens/LoginScreen';
import {CoursesScreen}from'../screens/CoursesScreen';
import {HistoryScreen}from'../screens/HistoryScreen';
import {MessengerScreen,ChatScreen}from'../screens/MessengerScreen';
import {LiveScreen}from'../screens/LiveScreen';
import {ProfileScreen}from'../screens/ProfileScreen';
import {CourseScreen}from'../screens/CourseScreen';
import {WebScreen}from'../screens/WebScreen';
const Stack=createNativeStackNavigator<RootStackParamList>();const Tab=createBottomTabNavigator<TabParamList>();
const icons={Courses:BookOpen,History:ClipboardList,Messenger:MessageCircle,Live:Radio,Profile:UserRound};
function Tabs(){return <Tab.Navigator screenOptions={({route})=>({headerShown:false,tabBarActiveTintColor:'#6366f1',tabBarInactiveTintColor:'#94a3b8',tabBarStyle:{height:64,paddingTop:6,paddingBottom:7,borderTopColor:'#eef2f7'},tabBarLabelStyle:{fontSize:10,fontWeight:'600'},tabBarIcon:({color,size})=>{const Icon=icons[route.name];return <Icon color={color} size={size}/>;}})}><Tab.Screen name="Courses" component={CoursesScreen} options={{title:'Kurslar'}}/><Tab.Screen name="History" component={HistoryScreen} options={{title:'Tarix'}}/><Tab.Screen name="Messenger" component={MessengerScreen} options={{title:'Xabarlar'}}/><Tab.Screen name="Live" component={LiveScreen} options={{title:'Jonli'}}/><Tab.Screen name="Profile" component={ProfileScreen} options={{title:'Profil'}}/></Tab.Navigator>}
export function RootNavigator(){const token=useAuthStore(s=>s.token);return <Stack.Navigator screenOptions={{headerBackTitle:'Ortga',headerTintColor:'#111827'}}>{!token?<Stack.Screen name="Login" component={LoginScreen} options={{headerShown:false}}/>:<><Stack.Screen name="Main" component={Tabs} options={{headerShown:false}}/><Stack.Screen name="Course" component={CourseScreen} options={({route})=>({title:route.params.title})}/><Stack.Screen name="Web" component={WebScreen} options={({route})=>({title:route.params.title})}/><Stack.Screen name="Chat" component={ChatScreen} options={({route})=>({title:route.params.title})}/></>}</Stack.Navigator>}
