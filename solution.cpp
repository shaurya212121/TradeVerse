#include<bits/stdc++.h>
using namespace std;
int main(){
    int TestsNumT;
    scanf("%d",&TestsNumT);
    while(TestsNumT--){
        int n;
        scanf("%d",&n);
        vector<int>a(n);
        for(int i=0;i<n;i++)scanf("%d",&a[i]);
        vector<int>b,r;
        for(int i=0;i<n;){
            int j=i;
            while(j<n&&a[j]==a[i])j++;
            b.push_back(a[i]);
            r.push_back(j-i);
            i=j;
        }
        int m=b.size();
        bool g2=false;
        for(int i=0;i+1<m;i++){
            if(r[i]>=2&&r[i+1]>=2){g2=true;break;}
        }
        if(g2){printf("%d\n",m+2);continue;}
        bool g1=false;
        for(int i=0;i<m;i++){
            if(r[i]<2)continue;
            bool ca=i>=1&&(i==1||b[i-2]!=b[i]);
            bool cb=i<=m-2&&(i==m-2||b[i]!=b[i+2]);
            if(ca||cb){g1=true;break;}
        }
        printf("%d\n",m+(g1?1:0));
    }
}
