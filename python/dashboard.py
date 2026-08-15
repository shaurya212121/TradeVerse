import streamlit as st
import sqlite3
import pandas as pd
import time
import zmq
import plotly.express as px

# 1. Page settings
st.set_page_config(page_title="Dashboard", layout="wide")
st.title("📈 Live TradeVerse Dashboard")

# 2. Setup ZeroMQ to listen to C++ Live Prices (Run this only once)
if 'zmq_socket' not in st.session_state:
    context = zmq.Context()
    socket = context.socket(zmq.SUB)
    socket.connect("tcp://localhost:5555") 
    socket.setsockopt_string(zmq.SUBSCRIBE, "") # CHANGED: Listen to EVERYTHING
    st.session_state.zmq_socket = socket
    st.session_state.price_history = [] 

# 3. Quickly grab any new prices from the C++ server without freezing
try:
    message = st.session_state.zmq_socket.recv_string(flags=zmq.DONTWAIT)
    # CHANGED: Message from C++ actually looks like "AAPL,$341.50"
    parts = message.split(",$")
    ticker = parts[0]
    price = float(parts[1])
    
    st.session_state.price_history.append({"Ticker": ticker, "Price": price})
    
    if len(st.session_state.price_history) > 100:
        st.session_state.price_history.pop(0)
except zmq.Again:
    pass

# 4. SPLIT SCREEN INTO TWO COLUMNS
col1, col2 = st.columns(2)

# --- LEFT COLUMN: LIVE CHART ---
with col1:
    st.subheader("Live Market Prices")
    if len(st.session_state.price_history) > 0:
        # Draw a beautiful line chart
        df_chart = pd.DataFrame(st.session_state.price_history)
        fig = px.line(df_chart, x=df_chart.index, y="Price", color="Ticker", title="Live Feed")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Waiting for live data from C++ Server on port 5555...")

# --- RIGHT COLUMN: PORTFOLIO ---
with col2:
    st.subheader("Client Portfolio")
    db = sqlite3.connect("tradeverse.db")
    
    client_rows = db.execute("SELECT client_id FROM clients").fetchall()
    all_clients = [row[0] for row in client_rows]
    
    if all_clients:
        selected_client = st.selectbox("Select Client:", all_clients)
        
        cash_data = db.execute("SELECT cash FROM clients WHERE client_id=?", (selected_client,)).fetchone()
        cash = cash_data[0] if cash_data else 0.0
        st.metric(label="Cash", value=f"${cash:,.2f}")
        
        table = pd.read_sql_query(f"SELECT ticker, quantity, avg_price FROM holdings WHERE client_id='{selected_client}' AND quantity > 0", db)
        st.dataframe(table, use_container_width=True)
    db.close()

# 5. Auto-refresh the page every 1 second
time.sleep(1)
st.rerun()