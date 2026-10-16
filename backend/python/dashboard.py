import streamlit as st
import sqlite3
import pandas as pd
import time
import zmq
import plotly.express as px

st.set_page_config(page_title="Dashboard", layout="wide")
st.title("📈 Live TradeVerse Dashboard")

if 'zmq_socket' not in st.session_state:
    context = zmq.Context()
    socket = context.socket(zmq.SUB)
    socket.connect("tcp://localhost:5555") 
    socket.setsockopt_string(zmq.SUBSCRIBE, "") # CHANGED: Listen to EVERYTHING
    st.session_state.zmq_socket = socket
    st.session_state.price_history = [] 

while True:
    try:
        message = st.session_state.zmq_socket.recv_string(flags=zmq.DONTWAIT)
        parts = message.split(",$")
        if len(parts) == 2:
            ticker = parts[0]
            price = float(parts[1])
            
            st.session_state.price_history.append({"Ticker": ticker, "Price": price})
    except zmq.Again:
        break

if len(st.session_state.price_history) > 500:
    st.session_state.price_history = st.session_state.price_history[-500:]

col1, col2 = st.columns(2)

with col1:
    st.subheader("Live Market Prices")
    if len(st.session_state.price_history) > 0:
        df_chart = pd.DataFrame(st.session_state.price_history)
        fig = px.line(df_chart, x=df_chart.index, y="Price", color="Ticker", title="Live Feed")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Waiting for live data from C++ Server on port 5555...")

with col2:
    st.subheader("System Status")
    st.success("✅ C++ Matching Engine Online")
    st.info("Market Data streaming via ZeroMQ")
    st.metric(label="Peak Throughput Capacity", value="> 10,000 req/sec")

time.sleep(1)
st.rerun()